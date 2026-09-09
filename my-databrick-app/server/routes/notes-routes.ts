import { Application, Request } from 'express';
import { z } from 'zod';

type Queryable = { query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> };
interface AppKitWithLakebase {
  lakebase: Queryable & { asUser(req: Request): Queryable };
  server: { extend(fn: (app: Application) => void): void };
}

const Priority = z.enum(['none', 'low', 'medium', 'high']);
const NoteBody = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().max(100_000).default(''),
  priority: Priority.default('none'),
  tags: z.array(z.string().trim().min(1).max(50)).max(30).default([]),
});
const NoteUpdate = NoteBody.partial();
const TimeEntry = z.object({ durationSeconds: z.number().int().min(1).max(86_400), occurredAt: z.string().datetime().optional() });

const SETUP_SQL = [
  'CREATE SCHEMA IF NOT EXISTS app',
  `CREATE TABLE IF NOT EXISTS app.notes (
    id BIGSERIAL PRIMARY KEY, owner TEXT NOT NULL DEFAULT current_user, title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '', priority TEXT NOT NULL DEFAULT 'none' CHECK (priority IN ('none','low','medium','high')),
    archived_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(owner, title)
  )`,
  `CREATE TABLE IF NOT EXISTS app.tags (
    id BIGSERIAL PRIMARY KEY, owner TEXT NOT NULL DEFAULT current_user, name TEXT NOT NULL,
    UNIQUE(owner, name)
  )`,
  'CREATE TABLE IF NOT EXISTS app.note_tags (note_id BIGINT NOT NULL REFERENCES app.notes(id) ON DELETE CASCADE, tag_id BIGINT NOT NULL REFERENCES app.tags(id) ON DELETE CASCADE, PRIMARY KEY(note_id, tag_id))',
  'CREATE TABLE IF NOT EXISTS app.note_links (source_note_id BIGINT NOT NULL REFERENCES app.notes(id) ON DELETE CASCADE, target_note_id BIGINT NOT NULL REFERENCES app.notes(id) ON DELETE CASCADE, PRIMARY KEY(source_note_id, target_note_id))',
  `CREATE TABLE IF NOT EXISTS app.time_entries (
    id BIGSERIAL PRIMARY KEY, note_id BIGINT NOT NULL REFERENCES app.notes(id) ON DELETE CASCADE,
    owner TEXT NOT NULL DEFAULT current_user, started_at TIMESTAMPTZ NOT NULL DEFAULT now(), ended_at TIMESTAMPTZ,
    duration_seconds INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((ended_at IS NULL AND duration_seconds IS NULL) OR (ended_at IS NOT NULL AND duration_seconds IS NOT NULL))
  )`,
  'CREATE UNIQUE INDEX IF NOT EXISTS one_active_timer_per_owner ON app.time_entries(owner) WHERE ended_at IS NULL',
  'CREATE INDEX IF NOT EXISTS notes_owner_updated_idx ON app.notes(owner, updated_at DESC)',
  'CREATE INDEX IF NOT EXISTS time_entries_note_idx ON app.time_entries(note_id)',
  'ALTER TABLE app.notes ENABLE ROW LEVEL SECURITY', 'ALTER TABLE app.tags ENABLE ROW LEVEL SECURITY', 'ALTER TABLE app.note_tags ENABLE ROW LEVEL SECURITY', 'ALTER TABLE app.note_links ENABLE ROW LEVEL SECURITY', 'ALTER TABLE app.time_entries ENABLE ROW LEVEL SECURITY',
  `DO $$ BEGIN
    CREATE POLICY notes_private ON app.notes USING (owner = current_user) WITH CHECK (owner = current_user);
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
    CREATE POLICY tags_private ON app.tags USING (owner = current_user) WITH CHECK (owner = current_user);
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
    CREATE POLICY entries_private ON app.time_entries USING (owner = current_user) WITH CHECK (owner = current_user);
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
    CREATE POLICY note_tags_private ON app.note_tags USING (EXISTS (SELECT 1 FROM app.notes n WHERE n.id = note_id AND n.owner = current_user));
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
    CREATE POLICY note_links_private ON app.note_links USING (EXISTS (SELECT 1 FROM app.notes n WHERE n.id = source_note_id AND n.owner = current_user));
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
];

function parseId(value: string) { const id = Number.parseInt(value, 10); return Number.isSafeInteger(id) && id > 0 ? id : null; }
function linksIn(content: string) { return [...content.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1].trim()).filter(Boolean); }
function cleanTags(tags: string[]) { return [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))]; }

async function setTags(db: Queryable, noteId: number, tags: string[]) {
  await db.query('DELETE FROM app.note_tags WHERE note_id = $1', [noteId]);
  for (const name of cleanTags(tags)) {
    const result = await db.query('INSERT INTO app.tags (name) VALUES ($1) ON CONFLICT (owner, name) DO UPDATE SET name = EXCLUDED.name RETURNING id', [name]);
    await db.query('INSERT INTO app.note_tags (note_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [noteId, result.rows[0].id]);
  }
}
async function setLinks(db: Queryable, noteId: number, content: string) {
  await db.query('DELETE FROM app.note_links WHERE source_note_id = $1', [noteId]);
  for (const title of [...new Set(linksIn(content))]) {
    const target = await db.query('SELECT id FROM app.notes WHERE title = $1', [title]);
    if (target.rows[0] && target.rows[0].id !== noteId) await db.query('INSERT INTO app.note_links (source_note_id, target_note_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [noteId, target.rows[0].id]);
  }
}

const noteFields = `n.id, n.title, n.content, n.priority, n.archived_at, n.created_at, n.updated_at,
  COALESCE((SELECT json_agg(t.name ORDER BY t.name) FROM app.note_tags nt JOIN app.tags t ON t.id = nt.tag_id WHERE nt.note_id = n.id), '[]') AS tags,
  COALESCE((SELECT SUM(duration_seconds) FROM app.time_entries te WHERE te.note_id = n.id AND te.ended_at IS NOT NULL), 0) AS tracked_seconds`;

export async function setupNotesRoutes(appkit: AppKitWithLakebase) {
  try { for (const statement of SETUP_SQL) await appkit.lakebase.query(statement); console.log('[notes] Schema ready'); }
  catch (error) { console.warn('[notes] Schema setup failed:', (error as Error).message); }

  appkit.server.extend((app) => {
    app.get('/api/notes', async (req, res) => {
      try {
        const db = appkit.lakebase.asUser(req); const archived = req.query.archived === 'true'; const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';
        const result = await db.query(`SELECT ${noteFields} FROM app.notes n WHERE n.archived_at IS ${archived ? 'NOT ' : ''}NULL AND ($1 = '' OR n.title ILIKE '%' || $1 || '%' OR n.content ILIKE '%' || $1 || '%') ORDER BY n.updated_at DESC`, [search]);
        res.json(result.rows);
      } catch (error) { console.error('List notes failed:', error); res.status(500).json({ error: 'Failed to list notes' }); }
    });

    app.post('/api/notes', async (req, res) => {
      const parsed = NoteBody.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: 'A title is required' }); return; }
      try {
        const db = appkit.lakebase.asUser(req); const data = parsed.data;
        const created = await db.query(`INSERT INTO app.notes (title, content, priority) VALUES ($1, $2, $3) RETURNING id`, [data.title, data.content, data.priority]);
        const id = Number(created.rows[0].id); await setTags(db, id, data.tags); await setLinks(db, id, data.content);
        const note = await db.query(`SELECT ${noteFields} FROM app.notes n WHERE n.id = $1`, [id]); res.status(201).json(note.rows[0]);
      } catch (error) { console.error('Create note failed:', error); res.status(409).json({ error: 'A note with that title already exists' }); }
    });

    app.get('/api/notes/:id', async (req, res) => {
      const id = parseId(req.params.id); if (!id) { res.status(400).json({ error: 'Invalid note id' }); return; }
      try {
        const db = appkit.lakebase.asUser(req); const note = await db.query(`SELECT ${noteFields} FROM app.notes n WHERE n.id = $1`, [id]);
        if (!note.rows[0]) { res.status(404).json({ error: 'Note not found' }); return; }
        const backlinks = await db.query('SELECT n.id, n.title FROM app.note_links l JOIN app.notes n ON n.id = l.source_note_id WHERE l.target_note_id = $1 ORDER BY n.title', [id]);
        res.json({ ...note.rows[0], backlinks: backlinks.rows });
      } catch (error) { console.error('Get note failed:', error); res.status(500).json({ error: 'Failed to get note' }); }
    });

    app.patch('/api/notes/:id', async (req, res) => {
      const id = parseId(req.params.id); const parsed = NoteUpdate.safeParse(req.body); if (!id || !parsed.success) { res.status(400).json({ error: 'Invalid note update' }); return; }
      try {
        const db = appkit.lakebase.asUser(req); const current = await db.query('SELECT title, content, priority FROM app.notes WHERE id = $1', [id]);
        if (!current.rows[0]) { res.status(404).json({ error: 'Note not found' }); return; }
        const data = { ...current.rows[0], ...parsed.data } as { title: string; content: string; priority: string; tags?: string[] };
        await db.query('UPDATE app.notes SET title = $1, content = $2, priority = $3, updated_at = now() WHERE id = $4', [data.title, data.content, data.priority, id]);
        if (parsed.data.tags) await setTags(db, id, parsed.data.tags); if (parsed.data.content !== undefined || parsed.data.title !== undefined) await setLinks(db, id, data.content);
        const note = await db.query(`SELECT ${noteFields} FROM app.notes n WHERE n.id = $1`, [id]); res.json(note.rows[0]);
      } catch (error) { console.error('Update note failed:', error); res.status(409).json({ error: 'Could not save note. Titles must be unique.' }); }
    });

    app.post('/api/notes/:id/archive', async (req, res) => {
      const id = parseId(req.params.id); if (!id) { res.status(400).json({ error: 'Invalid note id' }); return; }
      try { const db = appkit.lakebase.asUser(req); const result = await db.query('UPDATE app.notes SET archived_at = now(), updated_at = now() WHERE id = $1 RETURNING id', [id]); if (!result.rows[0]) { res.status(404).json({ error: 'Note not found' }); return; } res.status(204).send(); }
      catch { res.status(500).json({ error: 'Failed to archive note' }); }
    });
    app.post('/api/notes/:id/unarchive', async (req, res) => {
      const id = parseId(req.params.id); if (!id) { res.status(400).json({ error: 'Invalid note id' }); return; }
      try { const db = appkit.lakebase.asUser(req); const result = await db.query('UPDATE app.notes SET archived_at = NULL, updated_at = now() WHERE id = $1 RETURNING id', [id]); if (!result.rows[0]) { res.status(404).json({ error: 'Note not found' }); return; } res.status(204).send(); }
      catch { res.status(500).json({ error: 'Failed to restore note' }); }
    });

    app.get('/api/notes/:id/time', async (req, res) => {
      const id = parseId(req.params.id); if (!id) { res.status(400).json({ error: 'Invalid note id' }); return; }
      try { const result = await appkit.lakebase.asUser(req).query('SELECT id, started_at, ended_at, duration_seconds FROM app.time_entries WHERE note_id = $1 ORDER BY started_at DESC', [id]); res.json(result.rows); }
      catch { res.status(500).json({ error: 'Failed to list time entries' }); }
    });
    app.post('/api/notes/:id/time', async (req, res) => {
      const id = parseId(req.params.id); const parsed = TimeEntry.safeParse(req.body); if (!id || !parsed.success) { res.status(400).json({ error: 'A positive duration is required' }); return; }
      try { const db = appkit.lakebase.asUser(req); const startedAt = parsed.data.occurredAt ?? new Date().toISOString(); const result = await db.query('INSERT INTO app.time_entries (note_id, started_at, ended_at, duration_seconds) VALUES ($1, $2, $2::timestamptz + ($3 * interval \'1 second\'), $3) RETURNING id, started_at, ended_at, duration_seconds', [id, startedAt, parsed.data.durationSeconds]); res.status(201).json(result.rows[0]); }
      catch { res.status(500).json({ error: 'Failed to add time entry' }); }
    });
    app.post('/api/notes/:id/timer/start', async (req, res) => {
      const id = parseId(req.params.id); if (!id) { res.status(400).json({ error: 'Invalid note id' }); return; }
      try { const result = await appkit.lakebase.asUser(req).query('INSERT INTO app.time_entries (note_id) VALUES ($1) RETURNING id, note_id, started_at', [id]); res.status(201).json(result.rows[0]); }
      catch { res.status(409).json({ error: 'Stop the current timer before starting another' }); }
    });
    app.post('/api/timer/stop', async (req, res) => {
      try { const db = appkit.lakebase.asUser(req); const result = await db.query(`UPDATE app.time_entries SET ended_at = now(), duration_seconds = GREATEST(1, EXTRACT(EPOCH FROM now() - started_at)::int) WHERE id = (SELECT id FROM app.time_entries WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1) RETURNING id, note_id, started_at, ended_at, duration_seconds`); if (!result.rows[0]) { res.status(404).json({ error: 'No active timer' }); return; } res.json(result.rows[0]); }
      catch { res.status(500).json({ error: 'Failed to stop timer' }); }
    });
  });
}
