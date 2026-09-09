import { Button, Input, Select, Textarea } from '@databricks/appkit-ui/react';
import { Archive, Clock3, FilePlus2, Play, Search, Sparkles, Square, Tag, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

type Priority = 'none' | 'low' | 'medium' | 'high';
interface Note { id: number; title: string; content: string; priority: Priority; tags: string[]; archived_at: string | null; updated_at: string; tracked_seconds: number; backlinks?: Array<{ id: number; title: string }> }
interface TimeEntry { id: number; started_at: string; ended_at: string | null; duration_seconds: number | null }
interface AssistantReply { answer: string; sources: Array<{ noteId: number; title: string; score: number }> }

const priorityLabel: Record<Priority, string> = { none: 'No priority', low: 'Low', medium: 'Medium', high: 'High' };
const seconds = (value: number) => `${Math.floor(value / 3600)}h ${Math.floor((value % 3600) / 60)}m`;

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) { const body = await response.json().catch(() => null) as { error?: string } | null; throw new Error(body?.error ?? 'Request failed'); }
  return response.status === 204 ? (undefined as T) : response.json() as Promise<T>;
}

export function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([]); const [selected, setSelected] = useState<Note | null>(null);
  const [query, setQuery] = useState(''); const [showArchived, setShowArchived] = useState(false); const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null); const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
  const [tagText, setTagText] = useState(''); const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]); const [activeTimer, setActiveTimer] = useState<TimeEntry | null>(null);

  const loadNotes = async () => {
    setLoading(true); try { const data = await api<Note[]>(`/api/notes?archived=${showArchived}&q=${encodeURIComponent(query)}`); setNotes(data); if (selected && !data.some((note) => note.id === selected.id)) setSelected(null); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not load notes'); } finally { setLoading(false); }
  };
  useEffect(() => { const timer = window.setTimeout(() => void loadNotes(), 150); return () => window.clearTimeout(timer); }, [showArchived, query]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (selected) void openNote(selected.id); }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const openNote = async (id: number) => {
    try { const note = await api<Note>(`/api/notes/${id}`); setSelected(note); setTagText(note.tags.join(', ')); const entries = await api<TimeEntry[]>(`/api/notes/${id}/time`); setTimeEntries(entries); setActiveTimer(entries.find((entry) => !entry.ended_at) ?? null); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not open note'); }
  };
  const createNote = async () => {
    try { const note = await api<Note>('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Untitled note' }) }); setNotes((current) => [note, ...current]); setSelected(note); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not create note'); }
  };
  const save = async (patch: Partial<Pick<Note, 'title' | 'content' | 'priority' | 'tags'>>) => {
    if (!selected) return; setSaveState('saving');
    const optimistic = { ...selected, ...patch }; setSelected(optimistic);
    try { const saved = await api<Note>(`/api/notes/${selected.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }); setSelected(saved); setNotes((current) => current.map((note) => note.id === saved.id ? { ...note, ...saved } : note)); setSaveState('saved'); }
    catch (err) { setSaveState('error'); setError(err instanceof Error ? err.message : 'Could not save note'); }
  };
  const debouncedSave = (patch: Partial<Pick<Note, 'title' | 'content'>>) => { window.clearTimeout((window as Window & { noteSaveTimer?: number }).noteSaveTimer); (window as Window & { noteSaveTimer?: number }).noteSaveTimer = window.setTimeout(() => void save(patch), 650); };
  const archive = async () => { if (!selected) return; await api(`/api/notes/${selected.id}/${showArchived ? 'unarchive' : 'archive'}`, { method: 'POST' }); setSelected(null); void loadNotes(); };
  const addManualTime = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!selected) return; const form = new FormData(event.currentTarget); const minutes = Number(form.get('minutes')); if (!Number.isFinite(minutes) || minutes <= 0) return; try { await api(`/api/notes/${selected.id}/time`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ durationSeconds: Math.round(minutes * 60) }) }); event.currentTarget.reset(); void openNote(selected.id); } catch (err) { setError(err instanceof Error ? err.message : 'Could not add time'); } };
  const toggleTimer = async () => { if (!selected) return; try { if (activeTimer) await api('/api/timer/stop', { method: 'POST' }); else await api(`/api/notes/${selected.id}/timer/start`, { method: 'POST' }); void openNote(selected.id); } catch (err) { setError(err instanceof Error ? err.message : 'Could not update timer'); } };
  const tags = useMemo(() => tagText.split(',').map((tag) => tag.trim()).filter(Boolean), [tagText]);

  return <div className="notes-shell">
    <aside className="notes-sidebar">
      <div className="brand"><div><span className="eyebrow">PRIVATE WORKSPACE</span><h1>Field Notes</h1></div><Button size="icon" onClick={() => void createNote()} aria-label="New note"><FilePlus2 /></Button></div>
      <div className="search"><Search size={16} /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search notes" /></div>
      <button className="archive-toggle" onClick={() => setShowArchived((value) => !value)}><Archive size={15} /> {showArchived ? 'Show active' : 'Archived notes'}</button>
      <div className="note-list">{loading && <p className="muted">Loading notes…</p>}{!loading && notes.length === 0 && <p className="muted">No notes here yet.</p>}{notes.map((note) => <button className={`note-card ${selected?.id === note.id ? 'selected' : ''}`} key={note.id} onClick={() => void openNote(note.id)}><span className={`priority-dot ${note.priority}`} /><strong>{note.title}</strong><span>{note.tags.join(' · ') || 'No tags'}</span></button>)}</div>
    </aside>
    <section className="editor-pane">{error && <div className="error"><span>{error}</span><button onClick={() => setError(null)}><X size={15} /></button></div>}{selected ? <>
      <div className="editor-header"><span className={`save-state ${saveState}`}>{saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Save failed' : 'Saved'}</span><Button variant="ghost" size="sm" onClick={() => void archive()}><Archive size={15} /> {showArchived ? 'Restore' : 'Archive'}</Button></div>
      <Input className="title-input" value={selected.title} onChange={(event) => { const title = event.target.value; setSelected({ ...selected, title }); debouncedSave({ title }); }} aria-label="Note title" />
      <div className="metadata"><Select value={selected.priority} onValueChange={(priority) => void save({ priority: priority as Priority })}>{Object.entries(priorityLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select><div className="tag-editor"><Tag size={15} /><Input value={tagText} onChange={(event) => setTagText(event.target.value)} onBlur={() => void save({ tags })} placeholder="tags, separated by commas" /></div></div>
      <Textarea className="markdown-editor" value={selected.content} onChange={(event) => { const content = event.target.value; setSelected({ ...selected, content }); debouncedSave({ content }); }} placeholder="Write in Markdown. Link notes with [[Note title]]." />
      <footer className="note-footer"><div><Clock3 size={16} /> {seconds(Number(selected.tracked_seconds))} tracked</div><Button size="sm" variant={activeTimer ? 'destructive' : 'default'} onClick={() => void toggleTimer()}>{activeTimer ? <Square size={14} /> : <Play size={14} />}{activeTimer ? 'Stop timer' : 'Start timer'}</Button><form onSubmit={(event) => void addManualTime(event)}><Input name="minutes" type="number" min="1" placeholder="Minutes" aria-label="Minutes" /><Button type="submit" size="sm" variant="outline">Add time</Button></form></footer>
      {timeEntries.length > 0 && <div className="time-history"><strong>Recent time</strong>{timeEntries.slice(0, 3).map((entry) => <span key={entry.id}>{entry.ended_at ? seconds(Number(entry.duration_seconds)) : 'Timer running'} · {new Date(entry.started_at).toLocaleDateString()}</span>)}</div>}
      {selected.backlinks && selected.backlinks.length > 0 && <div className="backlinks"><strong>Linked from</strong>{selected.backlinks.map((note) => <button key={note.id} onClick={() => void openNote(note.id)}>{note.title}</button>)}</div>}
      <Assistant onOpenNote={(id) => void openNote(id)} />
    </> : <div className="empty-editor"><FilePlus2 size={34} /><h2>Your thinking, connected.</h2><p>Create a note to begin a private knowledge base.</p><Button onClick={() => void createNote()}>New note</Button><Assistant onOpenNote={(id) => void openNote(id)} /></div>}</section>
  </div>;
}

function Assistant({ onOpenNote }: { onOpenNote: (id: number) => void }) {
  const [question, setQuestion] = useState(''); const [reply, setReply] = useState<AssistantReply | null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);
  const ask = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!question.trim()) return; setLoading(true); setError(null); try { setReply(await api<AssistantReply>('/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question }) })); } catch (err) { setError(err instanceof Error ? err.message : 'Assistant unavailable'); } finally { setLoading(false); } };
  return <section className="assistant"><div className="assistant-title"><Sparkles size={16} /><strong>Ask your notes</strong></div><form onSubmit={(event) => void ask(event)}><Input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="What have I written about…" /><Button type="submit" size="sm" disabled={loading || !question.trim()}>{loading ? 'Thinking…' : 'Ask'}</Button></form>{error && <p className="assistant-error">{error}</p>}{reply && <><p className="assistant-answer">{reply.answer}</p>{reply.sources.length > 0 && <div className="assistant-sources">Sources: {reply.sources.map((source) => <button key={source.noteId} onClick={() => onOpenNote(source.noteId)}>{source.title}</button>)}</div>}</>}</section>;
}
