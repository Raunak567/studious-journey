import { z } from "zod";
import { Application } from "express";

interface AppKitWithLakebase {
  lakebase: {
    query(
      text: string,
      params?: unknown[],
    ): Promise<{ rows: Record<string, unknown>[] }>;
  };

  server: {
    extend(fn: (app: Application) => void): void;
  };
}

const SETUP_SCHEMA_SQL = `
  CREATE SCHEMA IF NOT EXISTS app
`;

const CREATE_NOTES_SQL = `
  CREATE TABLE IF NOT EXISTS app.notes (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'Untitled note',
    content TEXT NOT NULL DEFAULT '',
    priority TEXT NOT NULL DEFAULT 'Medium'
      CHECK (priority IN ('Low', 'Medium', 'High')),
    archived BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

const CREATE_TAGS_SQL = `
  CREATE TABLE IF NOT EXISTS app.tags (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

const CREATE_NOTE_TAGS_SQL = `
  CREATE TABLE IF NOT EXISTS app.note_tags (
    note_id INTEGER NOT NULL REFERENCES app.notes(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES app.tags(id) ON DELETE CASCADE,
    PRIMARY KEY (note_id, tag_id)
  )
`;

const CreateNoteBody = z.object({
  title: z.string().optional(),
  content: z.string().optional(),
  priority: z.enum(["Low", "Medium", "High"]).optional(),
  archived: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

const UpdateNoteBody = CreateNoteBody.partial();

const CreateTagBody = z.object({
  name: z.string().min(1),
});

function normalizeTags(tags: string[] = []) {
  return [
    ...new Set(
      tags
        .map((tag) => tag.trim().toLowerCase().replace(/^#/, ""))
        .filter(Boolean),
    ),
  ];
}

async function getNote(
  appkit: AppKitWithLakebase,
  id: number,
) {
  const result = await appkit.lakebase.query(
    `
      SELECT
        n.id,
        n.title,
        n.content,
        n.priority,
        n.archived,
        n.created_at,
        n.updated_at,
        COALESCE(
          ARRAY_AGG(t.name) FILTER (WHERE t.name IS NOT NULL),
          '{}'
        ) AS tags
      FROM app.notes n
      LEFT JOIN app.note_tags nt ON nt.note_id = n.id
      LEFT JOIN app.tags t ON t.id = nt.tag_id
      WHERE n.id = $1
      GROUP BY n.id
    `,
    [id],
  );

  return result.rows[0] ?? null;
}

async function setNoteTags(
  appkit: AppKitWithLakebase,
  noteId: number,
  tags: string[],
) {
  const normalized = normalizeTags(tags);

  await appkit.lakebase.query(
    "DELETE FROM app.note_tags WHERE note_id = $1",
    [noteId],
  );

  for (const tag of normalized) {
    const tagResult = await appkit.lakebase.query(
      `
        INSERT INTO app.tags (name)
        VALUES ($1)
        ON CONFLICT (name)
        DO UPDATE SET name = EXCLUDED.name
        RETURNING id
      `,
      [tag],
    );

    const tagId = tagResult.rows[0].id;

    await appkit.lakebase.query(
      `
        INSERT INTO app.note_tags (note_id, tag_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
      `,
      [noteId, tagId],
    );
  }
}

export async function setupKnowledgeBaseRoutes(
  appkit: AppKitWithLakebase,
) {
  /*
   * -----------------------------------------
   * DATABASE SETUP
   * -----------------------------------------
   */

  try {
    await appkit.lakebase.query(SETUP_SCHEMA_SQL);
    await appkit.lakebase.query(CREATE_NOTES_SQL);
    await appkit.lakebase.query(CREATE_TAGS_SQL);
    await appkit.lakebase.query(CREATE_NOTE_TAGS_SQL);

    console.log("[lakebase] Knowledge Base tables ready");
  } catch (err) {
    console.warn(
      "[lakebase] Database setup failed:",
      (err as Error).message,
    );

    console.warn(
      "[lakebase] Routes will still be registered",
    );
  }

  /*
   * -----------------------------------------
   * ROUTES
   * -----------------------------------------
   */

  appkit.server.extend((app) => {
    /*
     * GET NOTES
     */

    app.get("/api/notes", async (_req, res) => {
      try {
        const result = await appkit.lakebase.query(`
          SELECT
            n.id,
            n.title,
            n.content,
            n.priority,
            n.archived,
            n.created_at,
            n.updated_at,
            COALESCE(
              ARRAY_AGG(t.name) FILTER (WHERE t.name IS NOT NULL),
              '{}'
            ) AS tags
          FROM app.notes n
          LEFT JOIN app.note_tags nt
            ON nt.note_id = n.id
          LEFT JOIN app.tags t
            ON t.id = nt.tag_id
          GROUP BY n.id
          ORDER BY n.updated_at DESC
        `);

        res.json(result.rows);
      } catch (err) {
        console.error("Failed to list notes:", err);

        res.status(500).json({
          error: "Failed to list notes",
        });
      }
    });

    /*
     * GET SINGLE NOTE
     */

    app.get("/api/notes/:id", async (req, res) => {
      try {
        const id = Number(req.params.id);

        if (!Number.isInteger(id)) {
          res.status(400).json({
            error: "Invalid note id",
          });
          return;
        }

        const note = await getNote(appkit, id);

        if (!note) {
          res.status(404).json({
            error: "Note not found",
          });
          return;
        }

        res.json(note);
      } catch (err) {
        console.error("Failed to get note:", err);

        res.status(500).json({
          error: "Failed to get note",
        });
      }
    });

    /*
     * CREATE NOTE
     */

    app.post("/api/notes", async (req, res) => {
      try {
        const parsed = CreateNoteBody.safeParse(req.body);

        if (!parsed.success) {
          res.status(400).json({
            error: "Invalid note",
          });
          return;
        }

        const data = parsed.data;

        const result = await appkit.lakebase.query(
          `
            INSERT INTO app.notes
              (title, content, priority, archived)
            VALUES
              ($1, $2, $3, $4)
            RETURNING
              id,
              title,
              content,
              priority,
              archived,
              created_at,
              updated_at
          `,
          [
            data.title?.trim() || "Untitled note",
            data.content ?? "",
            data.priority ?? "Medium",
            data.archived ?? false,
          ],
        );

        const note = result.rows[0];

        await setNoteTags(
          appkit,
          Number(note.id),
          data.tags ?? [],
        );

        const completeNote = await getNote(
          appkit,
          Number(note.id),
        );

        res.status(201).json(completeNote);
      } catch (err) {
        console.error("Failed to create note:", err);

        res.status(500).json({
          error: "Failed to create note",
        });
      }
    });

    /*
     * UPDATE NOTE
     */

    app.patch("/api/notes/:id", async (req, res) => {
      try {
        const id = Number(req.params.id);

        if (!Number.isInteger(id)) {
          res.status(400).json({
            error: "Invalid note id",
          });
          return;
        }

        const parsed = UpdateNoteBody.safeParse(req.body);

        if (!parsed.success) {
          res.status(400).json({
            error: "Invalid note",
          });
          return;
        }

        const data = parsed.data;

        const existing = await getNote(appkit, id);

        if (!existing) {
          res.status(404).json({
            error: "Note not found",
          });
          return;
        }

        await appkit.lakebase.query(
          `
            UPDATE app.notes
            SET
              title = $1,
              content = $2,
              priority = $3,
              archived = $4,
              updated_at = NOW()
            WHERE id = $5
          `,
          [
            data.title ?? existing.title,
            data.content ?? existing.content,
            data.priority ?? existing.priority,
            data.archived ?? existing.archived,
            id,
          ],
        );

        if (data.tags !== undefined) {
          await setNoteTags(
            appkit,
            id,
            data.tags,
          );
        }

        const updated = await getNote(appkit, id);

        res.json(updated);
      } catch (err) {
        console.error("Failed to update note:", err);

        res.status(500).json({
          error: "Failed to update note",
        });
      }
    });

    /*
     * DELETE NOTE
     */

    app.delete("/api/notes/:id", async (req, res) => {
      try {
        const id = Number(req.params.id);

        if (!Number.isInteger(id)) {
          res.status(400).json({
            error: "Invalid note id",
          });
          return;
        }

        const result = await appkit.lakebase.query(
          `
            DELETE FROM app.notes
            WHERE id = $1
            RETURNING id
          `,
          [id],
        );

        if (result.rows.length === 0) {
          res.status(404).json({
            error: "Note not found",
          });
          return;
        }

        res.status(204).send();
      } catch (err) {
        console.error("Failed to delete note:", err);

        res.status(500).json({
          error: "Failed to delete note",
        });
      }
    });

    /*
     * -----------------------------------------
     * TAGS
     * -----------------------------------------
     */

    app.get("/api/tags", async (_req, res) => {
      try {
        const result = await appkit.lakebase.query(`
          SELECT
            t.id,
            t.name,
            COUNT(nt.note_id)::INTEGER AS note_count
          FROM app.tags t
          LEFT JOIN app.note_tags nt
            ON nt.tag_id = t.id
          GROUP BY t.id
          ORDER BY t.name ASC
        `);

        res.json(result.rows);
      } catch (err) {
        console.error("Failed to list tags:", err);

        res.status(500).json({
          error: "Failed to list tags",
        });
      }
    });

    /*
     * CREATE TAG
     */

    app.post("/api/tags", async (req, res) => {
      try {
        const parsed = CreateTagBody.safeParse(req.body);

        if (!parsed.success) {
          res.status(400).json({
            error: "Tag name is required",
          });
          return;
        }

        const name = parsed.data.name
          .trim()
          .toLowerCase()
          .replace(/^#/, "");

        const result = await appkit.lakebase.query(
          `
            INSERT INTO app.tags (name)
            VALUES ($1)
            ON CONFLICT (name)
            DO UPDATE SET name = EXCLUDED.name
            RETURNING id, name, created_at
          `,
          [name],
        );

        res.status(201).json(result.rows[0]);
      } catch (err) {
        console.error("Failed to create tag:", err);

        res.status(500).json({
          error: "Failed to create tag",
        });
      }
    });

    /*
     * -----------------------------------------
     * SIMPLE SEARCH
     *
     * This is useful before Vector Search.
     * -----------------------------------------
     */

    app.get("/api/notes/search", async (req, res) => {
      try {
        const query =
          typeof req.query.q === "string"
            ? req.query.q.trim()
            : "";

        if (!query) {
          res.json([]);
          return;
        }

        const result = await appkit.lakebase.query(
          `
            SELECT
              n.id,
              n.title,
              n.content,
              n.priority,
              n.archived,
              n.created_at,
              n.updated_at,
              COALESCE(
                ARRAY_AGG(t.name)
                  FILTER (WHERE t.name IS NOT NULL),
                '{}'
              ) AS tags
            FROM app.notes n
            LEFT JOIN app.note_tags nt
              ON nt.note_id = n.id
            LEFT JOIN app.tags t
              ON t.id = nt.tag_id
            WHERE
              n.title ILIKE $1
              OR n.content ILIKE $1
            GROUP BY n.id
            ORDER BY n.updated_at DESC
            LIMIT 10
          `,
          [`%${query}%`],
        );

        res.json(result.rows);
      } catch (err) {
        console.error("Failed to search notes:", err);

        res.status(500).json({
          error: "Failed to search notes",
        });
      }
    });

    /*
     * -----------------------------------------
     * ASSISTANT
     *
     * Temporary retrieval endpoint.
     *
     * The actual Databricks LLM + Vector Search
     * can be plugged into this endpoint next.
     * -----------------------------------------
     */

    app.post("/api/assistant", async (req, res) => {
      try {
        const message =
          typeof req.body?.message === "string"
            ? req.body.message.trim()
            : "";

        if (!message) {
          res.status(400).json({
            error: "Message is required",
          });
          return;
        }

        const result = await appkit.lakebase.query(
          `
            SELECT
              n.id,
              n.title,
              n.content,
              n.priority,
              n.archived,
              n.updated_at,
              COALESCE(
                ARRAY_AGG(t.name)
                  FILTER (WHERE t.name IS NOT NULL),
                '{}'
              ) AS tags
            FROM app.notes n
            LEFT JOIN app.note_tags nt
              ON nt.note_id = n.id
            LEFT JOIN app.tags t
              ON t.id = nt.tag_id
            WHERE
              n.title ILIKE $1
              OR n.content ILIKE $1
              OR EXISTS (
                SELECT 1
                FROM app.tags search_tag
                WHERE search_tag.name ILIKE $1
                  AND search_tag.id = nt.tag_id
              )
            GROUP BY n.id
            ORDER BY n.updated_at DESC
            LIMIT 5
          `,
          [`%${message}%`],
        );

        const sources = result.rows;

        if (sources.length === 0) {
          res.json({
            answer:
              "I couldn't find any relevant information in your notes.",
            sources: [],
          });
          return;
        }

        const context = sources
          .map(
            (note) =>
              `## ${note.title}\n\n${note.content}`,
          )
          .join("\n\n---\n\n");

        /*
         * For now return retrieved context.
         *
         * Replace this with the Databricks model call
         * once your model endpoint is configured.
         */

        res.json({
          answer:
            `I found ${sources.length} relevant note${
              sources.length === 1 ? "" : "s"
            } in your knowledge base.\n\n${context}`,
          sources: sources.map((note) => ({
            id: note.id,
            title: note.title,
          })),
        });
      } catch (err) {
        console.error("Assistant failed:", err);

        res.status(500).json({
          error: "Assistant failed",
        });
      }
    });
  });
}