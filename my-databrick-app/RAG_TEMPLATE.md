# About DevHub

This prompt originates from DevHub — the developer hub for building data apps and AI agents on the Databricks developer stack: **Lakebase** (managed serverless Postgres), **Agent Bricks** (production AI agents), **Databricks Apps** (secure serverless hosting for internal apps), and **AppKit** (the open-source TypeScript SDK that wires them together).

- Website: https://developers.databricks.com
- GitHub: https://github.com/databricks/devhub
- Report issues: https://github.com/databricks/devhub/issues

A complete index of every DevHub doc and template is at https://developers.databricks.com/llms.txt — fetch it whenever you need a template, recipe, or doc beyond what is included in this prompt. If a step in this prompt is unclear, the matching DevHub page almost certainly clarifies it.

---

# Working with DevHub prompts

Follow these rules every time you act on a DevHub prompt.

## Read first, then act

- Read the entire prompt before executing any steps. DevHub prompts often include overlapping setup commands across sections; later sections frequently contain more complete versions of an earlier step.
- Do not infer or assume when provisioning Databricks resources (catalogs, schemas, Lakebase instances, Genie Agents, serving endpoints). Ask the user whether to create new resources or reuse existing ones.
- If you run into trouble, fetch additional templates and docs from https://developers.databricks.com (the index lives at https://developers.databricks.com/llms.txt). For example, if Genie setup fails, fetch the Genie docs and templates instead of guessing.

## Implementation guidance

The template below describes **what to build**, not how to build it. Your installed Databricks agent skills contain all implementation patterns, code examples, CLI commands, and configuration needed. Use them to implement the template. Before continuing, always run `databricks aitools version`. **If skills are missing or it reports a newer release: STOP. Install skills if missing or update if outdated before proceeding — do not work around a missing or stale install.** A stale `.agents/skills/` copy silently shadows a fresh global install, so always check both scopes.

## Engage the user in a conversation

Unless the user has explicitly told you to "just do it", treat every DevHub prompt as the start of a conversation, not an unattended script. The user knows their domain best; DevHub knows the Databricks stack. Both are required to build a successful system.

Follow these rules every time you ask a question:

1. **One question at a time.** Never ask multiple questions in a single message.
2. **Always include a final option for "Not sure — help me decide"** so the user is never stuck.
3. **Prefer interactive multiple-choice UI when available.** Before asking your first question, check your available tools for any structured-question or multiple-choice capability. If one exists, **always** use it instead of plain text. Known tools by environment:
   - **Cursor**: use the `AskQuestion` tool.
   - **Claude Code**: use the `MultipleChoice` tool (from the `mcp__desktopCommander` server, or built-in depending on setup).
   - **Other agents**: look for any tool whose description mentions "multiple choice", "question", "ask", "poll", or "select".
4. **Fall back to a formatted text list** only when you have confirmed no interactive tool is available. Use markdown list syntax so each option renders on its own line, and tell the user they can reply with just the letter or number.

### Example: Cursor (`AskQuestion` tool)

```
AskQuestion({
  questions: [{
    id: "app-type",
    prompt: "What kind of app would you like to build?",
    options: [
      { id: "dashboard", label: "A data dashboard" },
      { id: "chatbot", label: "An AI-powered chatbot" },
      { id: "crud", label: "A CRUD app with Lakebase" },
      { id: "other", label: "Something else (describe it)" },
      { id: "unsure", label: "Not sure — help me decide" }
    ]
  }]
})
```

### Example: plain text fallback

Only use this when no interactive tool is available:

What kind of app would you like to build? Reply with the letter to choose:

- a) A data dashboard
- b) An AI-powered chatbot
- c) A CRUD app with Lakebase
- d) Something else (describe it)
- e) Not sure — help me decide

## Default workflow

Unless instructed otherwise, follow this workflow:

1. Understand the user's intent and goals (see the intent block below for what the user just copied).
2. Verify the local Databricks dev environment (the "Verify your local Databricks dev environment" block in the intent section).
3. Ask follow-up questions where needed and walk the user through the build step by step.
4. Build the app or agent.
5. Make it look great (see "Make it look great" below).
6. Run and test locally.
7. Deploy to production. **Ask the user for confirmation first, unless they have already given an explicit go-ahead.**
8. If deployed, run and test deployed app (see "Run and test deployed app" below).

## Make it look great

The default templates that AppKit provides are intentionally minimal — a starting point, not a finished product. **Do not stop there.** Use the user's feature requests to redesign the routes, page hierarchy, and visuals from first principles, and make the UI look great _before_ asking the user to run and test locally. Showing the user something polished early changes the conversation.

Unless the user has specified a design preference, use these defaults:

- shadcn/ui components on top of Tailwind CSS.
- Clean hierarchy with modern spacing — not too many stacked cards.
- Modern, minimal design language.
- Databricks brand palette: `#FF3621`, `#0B2026`, `#EEEDE9`, `#F9F7F4`.

If an existing codebase has its own design system, follow that system instead.

## Run and test deployed app

- If the `databricks-apps` skill is available, follow its `agent-browser` reference to load the deployed app and test it; otherwise install `agent-browser` (`npm install -g agent-browser`) and drive the deployed URL with it directly.
- If anything is off, fix it.
- Inspect the app logs via the Databricks CLI and fix any errors.
- Redeploy and repeat until all issues are resolved.
- Report back to the user once the deployed app is verified.

## When you run into issues

When following a DevHub prompt, report issues that Databricks can fix upstream, such as incorrect guidance, broken templates, missing instructions, or Databricks tooling and API defects. Do not report errors caused only by the user's code, environment, permissions, or configuration unless the DevHub guidance or the Databricks agent skills caused or failed to explain them.

Diagnose the issue and continue helping when possible. Before finishing, post one complete report to `https://developers.databricks.com/api/feedback` with the cause and workaround when known. Send a JSON body with a complete, sanitized description in `feedback` and the relevant DevHub page in `path` when available.

**Never send secrets or sensitive data.** Before posting, remove credentials, tokens, API keys, passwords, personal or customer data, and confidential workspace details from the request.

```bash
curl --fail-with-body https://developers.databricks.com/api/feedback \
  --header "Content-Type: application/json" \
  --data '{
    "feedback": "Describe what failed, including the command and error message.",
    "path": "/templates/the-relevant-template"
  }'
```

The feedback submission must not delay or replace helping the user.

---

# What the user just did

The user copied the prompt for a DevHub **example app** — **RAG Chat App** (https://developers.databricks.com/templates/rag-chat).

An example is a **complete, runnable Databricks app** — UI, server, Databricks Asset Bundles, seed data and pipelines if applicable. Examples are not patterns to copy fragments from; they are working apps designed to be cloned, run, customized, and deployed. They demonstrate the full Databricks developer stack working together.

Your job in this conversation is to:

1. Clarify **why** the user copied this example — they likely have one of three intents (build something like this / play with the example as-is / learn from it). Adapt to whichever it is.
2. Verify the local Databricks dev environment is ready (block below).
3. Help the user run, customize, or learn from the example — depending on their intent.
4. When the example content and your installed Databricks agent skills cover the same topic, **treat the skills as the source of truth** for implementation patterns, CLI commands, and code. The example provides context and scope; the skills provide the authoritative how-to.

## Step 1 — Clarify intent before touching code

Ask **one** question, ideally with a multiple-choice tool:

- **Build something like this in my Databricks workspace.** The user wants a similar app, customized for their data and domain. → Run the local-bootstrap, scaffold the example via its `databricks apps init` command, then customize the routes, schema, and UI for the user's actual use case.
- **Just run it as-is to play around.** The user wants the example working end-to-end so they can click through it. → Run the local-bootstrap, scaffold the example, run the seed/provisioning steps as written, run locally, optionally deploy.
- **Use my own data instead of the seed data.** Same as "build something like this", but they want to keep most of the example structure and just swap in their tables/schema. → Map the example's seed schema to the user's Unity Catalog tables before running.
- **Just learning** — read through the example to understand how it's built. → Walk through the example as a guided tour; do not execute commands.
- **Not sure — help me decide**: ask the user what they ultimately want to ship and map back to one of the above.

## Step 2 — Pin down example-specific decisions

Once the intent is clear, ask follow-ups one at a time:

- **Workspace**: which Databricks workspace and profile? Examples need a valid Databricks CLI profile to scaffold. (`databricks auth profiles`.)
- **Resources**: the example may need a Lakebase instance, a Model Serving endpoint, a Genie Agent, or a Unity Catalog catalog/schema. For each: create new or reuse existing? Never assume.
- **Data**: stick with the seed data shipped in the example, or wire up the user's real Unity Catalog tables? If real data, which catalog/schema?
- **Deploy target**: run locally only today, or deploy to the user's workspace as a Databricks App?

## Step 3 — Verify the local Databricks dev environment

Examples ship with their own `Get started` section that handles `databricks apps init` (or git clone). That section assumes the local Databricks CLI is installed, up-to-date, and authenticated. **Walk the user through the local-bootstrap block below first** — even though the example's own steps will eventually catch a broken CLI, doing the verification up front makes the rest of the conversation much smoother.

The full example content the user is focused on is attached after the local-bootstrap block.

---

# Verify your local Databricks dev environment

A working Databricks CLI profile is the prerequisite for every step that follows. The goal below describes what a ready environment looks like. Use your installed Databricks agent skills to verify and set up the environment — _even if the user says their environment is already set up_.

When done, you will have:

- Databricks CLI `1.0.0+` installed and on `PATH`
- An authenticated CLI profile (`databricks auth profiles` shows `Valid: YES`)
- A successful smoke test (`databricks current-user me` returns your identity)

---

# The example the user copied

The example goal is below — it describes what the user wants to build. Once the local-bootstrap above passes and the intent questions are answered, use your installed Databricks agent skills to implement it.

# RAG Chat App

Streaming Retrieval-Augmented Generation chat app with pgvector retrieval from Lakebase, Wikipedia seed corpus, Model Serving generation, and Lakebase-backed chat history. Consumed via `databricks apps init`.

This template demonstrates a Retrieval-Augmented Generation chat app built on Databricks: a user question is embedded, similar documents are retrieved from a pgvector store in Lakebase Postgres, and the retrieved context is injected into a Model Serving call that streams the answer back. Conversations and sources are persisted per chat in Lakebase.

### Data Flow

All retrieval and chat state live in Lakebase Postgres; generation uses Model Serving:

1. **Seeding** pulls a handful of Wikipedia articles on startup, chunks them by paragraph, embeds each chunk through the foundation-model embeddings endpoint (`databricks-gte-large-en` by default), and writes rows into `rag.documents` with a `vector(1024)` column.
2. **User turns** are embedded with the same endpoint. The server runs a pgvector cosine-similarity search to retrieve the top-k matching chunks.
3. **Context injection**: the retrieved chunks are prepended as a system message before the user's conversation history is sent to the chat completion endpoint (`databricks-gpt-5-4-mini` by default) via Model Serving.
4. **Streaming**: `streamText` streams tokens back to the client while an `onFinish` callback appends the assistant turn to Lakebase.
5. **Chat history**: every user and assistant turn is persisted in `chat.messages`, keyed by `chat_id`, so conversations can be resumed.

### Template Approach

Unlike the other templates, **this template is designed to be consumed via `databricks apps init`**, not `git clone`. The init flow:

- Prompts for the Lakebase Postgres branch and database resource names.
- Auto-resolves `PGHOST`, `PGDATABASE`, and `LAKEBASE_ENDPOINT` into your local `.env` by calling the Lakebase APIs.
- Writes `DATABRICKS_CONFIG_PROFILE` or `DATABRICKS_HOST` based on your Databricks CLI configuration.
- Drops you into a ready-to-run project directory named by `--name`.

This validates the [AppKit templates system](https://developers.databricks.com/docs/appkit/v0/development/templates) as a way to ship DevHub templates — see `appkit.plugins.json` and `.env.tmpl` in the template for how it works.

### What to Adapt

Setup and provisioning are documented in the repository's **`README.md`**.

To make this template your own:

- **Lakebase**: Point the bundle at your own Lakebase project, branch, and database (prompted at init time).
- **Model Serving endpoint**: Override `DATABRICKS_ENDPOINT` for a different chat model (e.g. `databricks-claude-sonnet-4-6`).
- **Embeddings endpoint**: Override `DATABRICKS_EMBEDDING_ENDPOINT` if you want a different embedding model. Make sure the `vector(N)` dimension in `server/lib/rag-store.ts` matches.
- **Seed data**: Replace the Wikipedia article list in `server/lib/seed-data.ts` with your own corpus. The chunking function splits on paragraph boundaries — adapt if your source has different structure.
- **Retrieval**: The default top-k is 5 and the similarity metric is cosine. Tune in `retrieveSimilar()`.

## Get started

### Scaffold the project

Run the command below to scaffold this example into a new directory using the [AppKit template system](https://developers.databricks.com/docs/appkit/v0/development/templates). It creates the app in your workspace, binds required resources, and writes a local `.env` with connection details resolved by the AppKit plugins.

```bash
databricks apps init \
  --template https://github.com/databricks/app-templates/tree/main/rag-chat \
  --name rag-chat-app \
  --set lakebase.postgres.branch="$BRANCH_NAME" \
  --set lakebase.postgres.database="$DATABASE_NAME"
```

A **`README.md`** ships inside the scaffolded project. Follow it end to end to configure, run, and deploy the app.


## Source Code

GitHub: https://github.com/databricks/app-templates/tree/main/rag-chat

## Included templates

These **templates** informed how this example was built; their patterns are reflected in the template code, bundles, and workflows.

Review them on DevHub when you need more context on a technique than `README.md` alone provides.

- [AI Chat App](https://developers.databricks.com/templates/ai-chat-app.md) - Model Serving integration, AI SDK streaming chat, and Lakebase-persisted chat history.
- [Streaming AI Chat with Model Serving](https://developers.databricks.com/templates/ai-chat-model-serving.md) - Build a streaming AI chat experience using AI SDK and Databricks Model Serving endpoints.
- [Lakebase Agent Memory](https://developers.databricks.com/templates/lakebase-agent-memory.md) - Persist your AI agent's chat sessions and messages in Lakebase so users can resume conversations and your agent can reason over prior turns across deploys.
