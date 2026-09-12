import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  ArrowLeft,
  Archive,
  Bot,
  Check,
  ChevronDown,
  Clock3,
  FileText,
  Hash,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Plus,
  Search,
  Send,
  Settings,
  Sparkles,
  Tag,
  Trash2,
  X,
} from "lucide-react";

type Priority = "Low" | "Medium" | "High";

type Note = {
  id: number;
  title: string;
  content: string;
  priority: Priority;
  archived: boolean;
  tags: string[];
  created_at: string;
  updated_at: string;
};

const API = {
  notes: "/api/notes",
  tags: "/api/tags",
  assistant: "/api/assistant",
};

const initialNotes: Note[] = [
  {
    id: 1,
    title: "Kubernetes Setup",
    content:
      "# Kubernetes Setup\n\nI deployed a lightweight **K3s cluster** on AWS.\n\n- K3s\n- Terraform\n- Ansible\n- AWS ALB Controller\n- ACM",
    priority: "High",
    archived: false,
    tags: ["kubernetes", "aws", "devops"],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 2,
    title: "Databricks Lakebase",
    content:
      "# Lakebase\n\nLakebase provides a PostgreSQL-compatible database for Databricks applications.\n\nUseful for persistent application data and CRUD APIs.",
    priority: "Medium",
    archived: false,
    tags: ["databricks", "lakebase"],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

type Page = "dashboard" | "notes" | "tags" | "time" | "assistant";

export default function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileMenu, setMobileMenu] = useState(false);

  useEffect(() => {
    loadNotes();
  }, []);

  async function loadNotes() {
    try {
      const response = await fetch(API.notes);

      if (!response.ok) throw new Error("API unavailable");

      const data = await response.json();
      setNotes(data);
    } catch {
      const saved = localStorage.getItem("knowledge-base-notes");

      if (saved) {
        setNotes(JSON.parse(saved));
      } else {
        setNotes(initialNotes);
        localStorage.setItem(
          "knowledge-base-notes",
          JSON.stringify(initialNotes),
        );
      }
    } finally {
      setLoading(false);
    }
  }

  function saveLocal(updated: Note[]) {
    setNotes(updated);
    localStorage.setItem(
      "knowledge-base-notes",
      JSON.stringify(updated),
    );
  }

  async function createNote() {
    const newNote: Note = {
      id: Date.now(),
      title: "Untitled note",
      content: "",
      priority: "Medium",
      archived: false,
      tags: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    try {
      const response = await fetch(API.notes, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newNote),
      });

      if (response.ok) {
        const created = await response.json();
        setNotes((previous) => [created, ...previous]);
        setSelectedNote(created);
        setPage("notes");
        return;
      }
    } catch {
      // Local fallback
    }

    saveLocal([newNote, ...notes]);
    setSelectedNote(newNote);
    setPage("notes");
  }

  async function saveNote(note: Note) {
    const updated = {
      ...note,
      updated_at: new Date().toISOString(),
    };

    try {
      const response = await fetch(`${API.notes}/${note.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });

      if (response.ok) {
        const saved = await response.json();

        setNotes((previous) =>
          previous.map((item) => (item.id === note.id ? saved : item)),
        );

        setSelectedNote(saved);
        return;
      }
    } catch {
      // Local fallback
    }

    const next = notes.map((item) =>
      item.id === note.id ? updated : item,
    );

    saveLocal(next);
    setSelectedNote(updated);
  }

  async function deleteNote(id: number) {
    try {
      await fetch(`${API.notes}/${id}`, {
        method: "DELETE",
      });
    } catch {
      // Local fallback
    }

    const next = notes.filter((note) => note.id !== id);

    saveLocal(next);
    setSelectedNote(null);
  }

  async function toggleArchive(note: Note) {
    await saveNote({
      ...note,
      archived: !note.archived,
    });
  }

  return (
    <div className="min-h-screen  bg-zinc-950 text-zinc-100">
      <Header
        page={page}
        setPage={(next) => {
          setPage(next);
          setSelectedNote(null);
          setMobileMenu(false);
        }}
        mobileMenu={mobileMenu}
        setMobileMenu={setMobileMenu}
        onCreateNote={createNote}
      />

      <main className="mx-auto max-w-7xl px-5 py-8 md:px-8">
        {loading ? (
          <Loading />
        ) : selectedNote ? (
          <NoteEditor
            note={selectedNote}
            onBack={() => setSelectedNote(null)}
            onSave={saveNote}
            onDelete={deleteNote}
            onArchive={toggleArchive}
          />
        ) : (
          <>
            {page === "dashboard" && (
              <Dashboard
                notes={notes}
                openNote={setSelectedNote}
                createNote={createNote}
              />
            )}

            {page === "notes" && (
              <NotesPage
                notes={notes}
                openNote={setSelectedNote}
                createNote={createNote}
              />
            )}

            {page === "tags" && (
              <TagsPage notes={notes} openNote={setSelectedNote} />
            )}

            {page === "time" && <TimePage notes={notes} />}

            {page === "assistant" && <Assistant notes={notes} />}
          </>
        )}
      </main>
    </div>
  );
}

/* -------------------------------------------------- */
/* HEADER */
/* -------------------------------------------------- */

function Header({
  page,
  setPage,
  mobileMenu,
  setMobileMenu,
  onCreateNote,
}: {
  page: Page;
  setPage: (page: Page) => void;
  mobileMenu: boolean;
  setMobileMenu: (value: boolean) => void;
  onCreateNote: () => void;
}) {
  const navigation: {
    id: Page;
    label: string;
    icon: typeof LayoutDashboard;
  }[] = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "notes", label: "Notes", icon: FileText },
    { id: "tags", label: "Tags", icon: Hash },
    { id: "time", label: "Time", icon: Clock3 },
    { id: "assistant", label: "Assistant", icon: Bot },
  ];

  return (
    <header className="border-b border-zinc-800 bg-zinc-900">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 md:px-8">
        <button
          onClick={() => setPage("dashboard")}
          className="flex items-center gap-2"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500 text-white shadow-sm shadow-indigo-500/20">
            <Sparkles size={16} />
          </div>

          <span className="text-lg font-semibold tracking-tight">
            Knowledge Base
          </span>
        </button>

        <nav className="hidden items-center gap-1 md:flex">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = page === item.id;

            return (
              <button
                key={item.id}
                onClick={() => setPage(item.id)}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                  active
                    ? "bg-zinc-800 font-medium text-white"
                    : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
                }`}
              >
                <Icon size={15} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <button
            onClick={onCreateNote}
            className="hidden items-center gap-2 rounded-lg bg-indigo-500 px-3.5 py-2 text-sm font-medium text-white shadow-sm shadow-indigo-500/20 transition hover:bg-indigo-400 sm:flex"
          >
            <Plus size={15} />
            New note
          </button>

          <button
            onClick={() => setMobileMenu(!mobileMenu)}
            className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-900 hover:text-white md:hidden"
          >
            {mobileMenu ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {mobileMenu && (
        <div className="border-t border-zinc-800 px-5 py-3 md:hidden">
          <div className="flex flex-col gap-1">
            <button
              onClick={onCreateNote}
              className="mb-1 flex items-center gap-3 rounded-lg bg-indigo-500 px-3 py-3 text-left text-sm font-medium text-white"
            >
              <Plus size={17} />
              New note
            </button>

            {navigation.map((item) => {
              const Icon = item.icon;

              return (
                <button
                  key={item.id}
                  onClick={() => setPage(item.id)}
                  className="flex items-center gap-3 rounded-lg px-3 py-3 text-left text-sm text-zinc-300 hover:bg-zinc-900 hover:text-white"
                >
                  <Icon size={17} />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </header>
  );
}

/* -------------------------------------------------- */
/* DASHBOARD */
/* -------------------------------------------------- */

function Dashboard({
  notes,
  openNote,
  createNote,
}: {
  notes: Note[];
  openNote: (note: Note) => void;
  createNote: () => void;
}) {
  const active = notes.filter((note) => !note.archived).length;
  const archived = notes.filter((note) => note.archived).length;

  const tags = new Set(notes.flatMap((note) => note.tags));

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="mb-2 text-sm font-medium text-zinc-400">
            Knowledge Base
          </p>

          <h1 className="text-3xl font-semibold tracking-tight">
            Your knowledge, organized.
          </h1>

          <p className="mt-2 max-w-xl text-sm text-zinc-400">
            Capture ideas, organize your notes, and ask AI questions about
            everything you've saved.
          </p>
        </div>

        <div />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Active notes"
          value={active}
          icon={<FileText size={17} />}
        />

        <Stat
          label="Archived"
          value={archived}
          icon={<Archive size={17} />}
        />

        <Stat
          label="Tags"
          value={tags.size}
          icon={<Hash size={17} />}
        />

        <Stat
          label="AI ready"
          value={active}
          icon={<Bot size={17} />}
        />
      </div>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Recent notes</h2>
            <p className="text-sm text-zinc-400">
              Your latest knowledge
            </p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {notes.slice(0, 6).map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              onClick={() => openNote(note)}
            />
          ))}
        </div>

        {notes.length === 0 && <EmptyNotes createNote={createNote} />}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="mb-5 flex items-center justify-between">
        <span className="text-sm text-zinc-400">{label}</span>
        <span className="text-zinc-400">{icon}</span>
      </div>

      <div className="text-3xl font-semibold">{value}</div>
    </div>
  );
}

/* -------------------------------------------------- */
/* NOTES */
/* -------------------------------------------------- */

function NotesPage({
  notes,
  openNote,
  createNote,
}: {
  notes: Note[];
  openNote: (note: Note) => void;
  createNote: () => void;
}) {
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState("All");
  const [showArchived, setShowArchived] = useState(false);

  const allTags = Array.from(
    new Set(notes.flatMap((note) => note.tags)),
  ).sort();

  const filtered = useMemo(() => {
    return notes.filter((note) => {
      const query = search.toLowerCase();

      const matchesSearch =
        note.title.toLowerCase().includes(query) ||
        note.content.toLowerCase().includes(query);

      const matchesTag = tag === "All" || note.tags.includes(tag);

      const matchesArchive =
        showArchived || !note.archived;

      return matchesSearch && matchesTag && matchesArchive;
    });
  }, [notes, search, tag, showArchived]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Notes
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Everything you've captured.
          </p>
        </div>

        <div />
      </div>

      <div className="flex flex-col gap-3 md:flex-row">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
          />

          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search notes..."
            className="h-10 w-full rounded-lg border border-zinc-800 bg-zinc-900 pl-9 pr-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-zinc-400"
          />
        </div>

        <select
          value={tag}
          onChange={(event) => setTag(event.target.value)}
          className="h-10 rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none"
        >
          <option>All</option>
          {allTags.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>

        <button
          onClick={() => setShowArchived(!showArchived)}
          className={`h-10 rounded-lg border px-3 text-sm ${
            showArchived
              ? "border-indigo-500 bg-indigo-500 text-white"
              : "border-zinc-800 bg-zinc-900"
          }`}
        >
          {showArchived ? "Showing archived" : "Archived"}
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((note) => (
          <NoteCard
            key={note.id}
            note={note}
            onClick={() => openNote(note)}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="rounded-xl border border-dashed border-zinc-700 py-16 text-center">
          <FileText className="mx-auto mb-3 text-zinc-400" size={28} />
          <p className="font-medium">No notes found</p>
          <p className="mt-1 text-sm text-zinc-400">
            Try another search or create a new note.
          </p>
        </div>
      )}
    </div>
  );
}

function NoteCard({
  note,
  onClick,
}: {
  note: Note;
  onClick: () =>  void;
}) {
  return (
    <button
      onClick={onClick}
      className="group rounded-xl border border-zinc-800 bg-zinc-900 p-5 text-left transition hover:-translate-y-0.5 hover:border-zinc-700 hover:shadow-sm"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <h3 className="line-clamp-2 font-medium">{note.title}</h3>

        <PriorityBadge priority={note.priority} />
      </div>

      <p className="mb-5 line-clamp-3 text-sm leading-6 text-zinc-500">
        {stripMarkdown(note.content) || "Empty note"}
      </p>

      <div className="flex flex-wrap gap-1.5">
        {note.tags.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="rounded-md bg-zinc-800 px-2 py-1 text-xs text-zinc-300"
          >
            #{tag}
          </span>
        ))}
      </div>

      <div className="mt-4 border-t border-zinc-800 pt-3 text-xs text-zinc-400">
        Updated {formatDate(note.updated_at)}
      </div>
    </button>
  );
}

function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className="shrink-0 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-[11px] text-zinc-300">
      {priority}
    </span>
  );
}

/* -------------------------------------------------- */
/* NOTE EDITOR */
/* -------------------------------------------------- */

function NoteEditor({
  note,
  onBack,
  onSave,
  onDelete,
  onArchive,
}: {
  note: Note;
  onBack: () => void;
  onSave: (note: Note) => void;
  onDelete: (id: number) => void;
  onArchive: (note: Note) => void;
}) {
  const [draft, setDraft] = useState(note);
  const [preview, setPreview] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(note);
  }, [note]);

  function update<K extends keyof Note>(key: K, value: Note[K]) {
    setDraft((previous) => ({
      ...previous,
      [key]: value,
    }));
    setSaved(false);
  }

  function addTag() {
    const value = tagInput.trim().toLowerCase().replace(/^#/, "");

    if (!value || draft.tags.includes(value)) {
      setTagInput("");
      return;
    }

    update("tags", [...draft.tags, value]);
    setTagInput("");
  }

  function removeTag(tag: string) {
    update(
      "tags",
      draft.tags.filter((item) => item !== tag),
    );
  }

  async function handleSave() {
    await onSave(draft);
    setSaved(true);

    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="mx-auto max-w-5xl">
      <button
        onClick={onBack}
        className="mb-6 flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-100"
      >
        <ArrowLeft size={16} />
        Back to notes
      </button>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900">
        <div className="flex flex-col justify-between gap-4 border-b border-zinc-800 p-5 md:flex-row md:items-center">
          <input
            value={draft.title}
            onChange={(event) =>
              update("title", event.target.value)
            }
            className="min-w-0 flex-1 bg-transparent text-2xl font-semibold outline-none"
            placeholder="Note title"
          />

          <div className="flex items-center gap-2">
            <select
              value={draft.priority}
              onChange={(event) =>
                update(
                  "priority",
                  event.target.value as Priority,
                )
              }
              className="h-9 rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm"
            >
              <option>Low</option>
              <option>Medium</option>
              <option>High</option>
            </select>

            <button
              onClick={() => onArchive(draft)}
              className="flex h-9 items-center gap-2 rounded-lg border border-zinc-800 px-3 text-sm hover:bg-zinc-800"
            >
              <Archive size={15} />
              <span className="hidden sm:inline">
                {draft.archived ? "Unarchive" : "Archive"}
              </span>
            </button>

            <button
              onClick={() => onDelete(draft.id)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-800 text-zinc-500 hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-400"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        <div className="border-b border-zinc-800 px-5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            {draft.tags.map((tag) => (
              <button
                key={tag}
                onClick={() => removeTag(tag)}
                className="group flex items-center gap-1 rounded-md bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300"
              >
                #{tag}
                <X
                  size={11}
                  className="hidden group-hover:block"
                />
              </button>
            ))}

            <input
              value={tagInput}
              onChange={(event) => setTagInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addTag();
                }
              }}
              placeholder="+ Add tag"
              className="w-24 bg-transparent text-xs outline-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
          <div className="flex rounded-lg bg-zinc-800 p-1">
            <button
              onClick={() => setPreview(false)}
              className={`rounded-md px-3 py-1.5 text-xs ${
                !preview
                  ? " bg-zinc-700 font-medium text-white shadow-sm"
                  : "text-zinc-500"
              }`}
            >
              Markdown
            </button>

            <button
              onClick={() => setPreview(true)}
              className={`rounded-md px-3 py-1.5 text-xs ${
                preview
                  ? " bg-zinc-700 font-medium text-white shadow-sm"
                  : "text-zinc-500"
              }`}
            >
              Preview
            </button>
          </div>

          <span className="text-xs text-zinc-400">
            Markdown supported
          </span>
        </div>

        <div className="min-h-[500px] p-5">
          {preview ? (
            <article className="prose prose-invert max-w-none text-sm">
              <ReactMarkdown>
                {draft.content || "*Nothing here yet.*"}
              </ReactMarkdown>
            </article>
          ) : (
            <textarea
              value={draft.content}
              onChange={(event) =>
                update("content", event.target.value)
              }
              placeholder="Write your note in Markdown..."
              className="min-h-[500px] w-full resize-none bg-transparent font-mono text-sm leading-7 outline-none"
              spellCheck={false}
            />
          )}
        </div>

        <div className="flex items-center justify-between border-t border-zinc-800 px-5 py-4">
          <span className="text-xs text-zinc-400">
            {saved
              ? "Saved"
              : `Last updated ${formatDate(draft.updated_at)}`}
          </span>

          <button
            onClick={handleSave}
            className="flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white shadow-sm shadow-indigo-500/20 hover:bg-indigo-400"
          >
            {saved ? <Check size={15} /> : null}
            {saved ? "Saved" : "Save note"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------- */
/* TAGS */
/* -------------------------------------------------- */

function TagsPage({
  notes,
  openNote,
}: {
  notes: Note[];
  openNote: (note: Note) => void;
}) {
  const tags = useMemo(() => {
    const counts = new Map<string, number>();

    notes.forEach((note) => {
      note.tags.forEach((tag) => {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      });
    });

    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [notes]);

  const [selected, setSelected] = useState<string | null>(null);

  const matching = selected
    ? notes.filter((note) => note.tags.includes(selected))
    : [];

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Tags
        </h1>

        <p className="mt-1 text-sm text-zinc-400">
          Organize your knowledge by topic.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {tags.map(([tag, count]) => (
          <button
            key={tag}
            onClick={() =>
              setSelected(selected === tag ? null : tag)
            }
            className={`rounded-xl border p-5 text-left transition ${
              selected === tag
                ? "border-indigo-500 bg-indigo-500 text-white"
                : "border-zinc-800 hover:border-zinc-600"
            }`}
          >
            <Hash size={18} className="mb-4" />

            <div className="font-medium">#{tag}</div>

            <div
              className={`mt-1 text-sm ${
                selected === tag
                  ? "text-zinc-400"
                  : "text-zinc-500"
              }`}
            >
              {count} {count === 1 ? "note" : "notes"}
            </div>
          </button>
        ))}
      </div>

      {selected && (
        <section>
          <h2 className="mb-3 font-medium">
            Notes tagged #{selected}
          </h2>

          <div className="grid gap-3 md:grid-cols-2">
            {matching.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                onClick={() => openNote(note)}
              />
            ))}
          </div>
        </section>
      )}

      {tags.length === 0 && (
        <div className="rounded-xl border border-dashed border-zinc-700 py-16 text-center text-sm text-zinc-400">
          Create a tag while editing a note.
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------- */
/* TIME */
/* -------------------------------------------------- */

function TimePage({ notes }: { notes: Note[] }) {
  const totalWords = notes.reduce(
    (total, note) =>
      total + note.content.trim().split(/\s+/).filter(Boolean).length,
    0,
  );

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Time
        </h1>

        <p className="mt-1 text-sm text-zinc-400">
          A simple overview of your knowledge-building activity.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Stat
          label="Notes created"
          value={notes.length}
          icon={<FileText size={17} />}
        />

        <Stat
          label="Words captured"
          value={totalWords}
          icon={<Clock3 size={17} />}
        />

        <Stat
          label="Topics"
          value={
            new Set(notes.flatMap((note) => note.tags)).size
          }
          icon={<Tag size={17} />}
        />
      </div>

      <div className="rounded-xl border border-zinc-800 p-6">
        <h2 className="font-medium">Your knowledge activity</h2>

        <p className="mt-2 text-sm leading-6 text-zinc-500">
          Keep capturing notes and your knowledge base will become
          increasingly useful to the AI assistant.
        </p>

        <div className="mt-6 flex h-32 items-end gap-2">
          {[30, 50, 42, 70, 55, 80, 65].map(
            (height, index) => (
              <div
                key={index}
                className="flex-1 rounded-t-md bg-zinc-800"
                style={{ height: `${height}%` }}
              />
            ),
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------- */
/* ASSISTANT */
/* -------------------------------------------------- */

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  sources?: Note[];
};

function Assistant({ notes }: { notes: Note[] }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Hi! Ask me anything about your notes. I can search your knowledge base and use relevant notes to answer.",
    },
  ]);

  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);

  async function sendMessage() {
    const question = input.trim();

    if (!question || thinking) return;

    setInput("");

    const userMessage: ChatMessage = {
      role: "user",
      content: question,
    };

    setMessages((previous) => [...previous, userMessage]);
    setThinking(true);

    try {
      const response = await fetch(API.assistant, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: question,
          notes,
        }),
      });

      if (response.ok) {
        const result = await response.json();

        setMessages((previous) => [
          ...previous,
          {
            role: "assistant",
            content: result.answer,
            sources: result.sources ?? [],
          },
        ]);

        return;
      }
    } catch {
      // Local RAG fallback
    } finally {
      setThinking(false);
    }

    /*
     * Temporary local retrieval fallback.
     * Once /api/assistant is connected to your Databricks
     * model + vector search, this path is no longer used.
     */
    const words = question
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 2);

    const matches = notes
      .map((note) => {
        const text =
          `${note.title} ${note.content} ${note.tags.join(" ")}`
            .toLowerCase();

        const score = words.reduce(
          (total, word) =>
            total + (text.includes(word) ? 1 : 0),
          0,
        );

        return { note, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((item) => item.note);

    const answer =
      matches.length > 0
        ? `I found ${matches.length} relevant note${
            matches.length > 1 ? "s" : ""
          } in your knowledge base:\n\n${matches
            .map(
              (note) =>
                `**${note.title}**\n${stripMarkdown(
                  note.content,
                ).slice(0, 250)}...`,
            )
            .join("\n\n")}`
        : "I couldn't find anything relevant in your notes.";

    setMessages((previous) => [
      ...previous,
      {
        role: "assistant",
        content: answer,
        sources: matches,
      },
    ]);

    setThinking(false);
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-10rem)] max-w-4xl flex-col">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500 text-white shadow-lg shadow-indigo-500/20">
          <Bot size={22} />
        </div>

        <h1 className="text-3xl font-semibold tracking-tight">
          AI Assistant
        </h1>

        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-zinc-500">
          Ask questions about your notes. The assistant will use your
          knowledge base to find relevant information.
        </p>
      </div>

      <div className="flex-1 space-y-6">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${
              message.role === "user"
                ? "justify-end"
                : "justify-start"
            }`}
          >
            <div
              className={`max-w-[80%] ${
                message.role === "user"
                  ? "rounded-2xl rounded-br-md bg-zinc-800 px-4 py-3 text-sm text-zinc-100"
                  : "w-full max-w-2xl"
              }`}
            >
              {message.role === "assistant" ? (
                <>
                  <div className="mb-2 flex items-center gap-2 text-xs font-medium text-zinc-500">
                    <Bot size={14} />
                    Knowledge Assistant
                  </div>

                  <article className="prose prose-sm prose-invert max-w-none">
                    <ReactMarkdown>
                      {message.content}
                    </ReactMarkdown>
                  </article>

                  {message.sources &&
                    message.sources.length > 0 && (
                      <div className="mt-4 border-t border-zinc-800 pt-3">
                        <p className="mb-2 text-xs font-medium text-zinc-500">
                          Sources
                        </p>

                        <div className="flex flex-wrap gap-2">
                          {message.sources.map((source) => (
                            <span
                              key={source.id}
                              className="rounded-md bg-zinc-800 px-2 py-1 text-xs text-zinc-300"
                            >
                              {source.title}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                </>
              ) : (
                message.content
              )}
            </div>
          </div>
        ))}

        {thinking && (
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <Bot size={16} />
            Searching your knowledge base...
          </div>
        )}
      </div>

      <div className="mt-8">
        <div className="flex items-end gap-2 rounded-xl border border-zinc-800 bg-zinc-900 p-2 shadow-sm focus-within:border-zinc-500">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey
              ) {
                event.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Ask about your notes..."
            rows={2}
            className="min-h-12 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none"
          />

          <button
            onClick={sendMessage}
            disabled={!input.trim() || thinking}
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500 text-white disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Send size={16} />
          </button>
        </div>

        <p className="mt-2 text-center text-[11px] text-zinc-400">
          AI responses are generated from your knowledge base.
          Review important information before relying on it.
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------- */
/* HELPERS */
/* -------------------------------------------------- */

function Loading() {
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="h-8 w-48 animate-pulse rounded bg-zinc-800" />
      <div className="h-4 w-72 animate-pulse rounded bg-zinc-800" />

      <div className="grid gap-4 pt-5 md:grid-cols-3">
        {[1, 2, 3].map((item) => (
          <div
            key={item}
            className="h-32 animate-pulse rounded-xl bg-zinc-800"
          />
        ))}
      </div>
    </div>
  );
}

function EmptyNotes({ createNote }: { createNote: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-700 py-16 text-center">
      <FileText
        size={28}
        className="mx-auto mb-3 text-zinc-400"
      />

      <p className="font-medium">No notes yet</p>

      <p className="mt-1 text-sm text-zinc-400">
        Start building your knowledge base.
      </p>

      <button
        onClick={createNote}
        className="mt-5 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white shadow-sm shadow-indigo-500/20 hover:bg-indigo-400"
      >
        Create your first note
      </button>
    </div>
  );
}

function stripMarkdown(value: string) {
  return value
    .replace(/#{1,6}\s/g, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`(.*?)`/g, "$1")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/[-*]\s/g, "")
    .replace(/\n+/g, " ")
    .trim();
}

function formatDate(value: string) {
  if (!value) return "recently";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "recently";

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}