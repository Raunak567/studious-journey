# Private notes RAG synchronization

The application stores source-of-truth notes in Lakebase. Configure a Lakeflow Job to run every five minutes and incrementally mirror `app.notes`, its tags, and the note owner into a Unity Catalog Delta table. Split Markdown content into overlapping chunks before writing the table.

The Delta Sync Vector Search index configured by `vector_search_index` must index the chunk text and retain these fields: `owner_email`, `note_id`, `title`, `tags`, `updated_at`, and `chunk_text`. Grant the deployed app's service principal `SELECT` access to that index. All assistant retrieval requests apply an `owner_email` filter for the signed-in user. Archive or delete updates must remove corresponding source-table chunks.
