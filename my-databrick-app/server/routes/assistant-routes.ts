import { Application, Request } from 'express';
import { z } from 'zod';

type Queryable = { query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> };
type SearchResult = { data: { note_id?: number | string; title?: string; chunk_text?: string }; score: number };
interface AssistantAppKit {
  lakebase: { asUser(req: Request): Queryable };
  aiSearch?: { query(alias: string, request: { queryText: string; numResults: number; filters: Record<string, string> }): Promise<{ results: SearchResult[] }> };
  serving?: (alias: string) => { asUser(req: Request): { invoke(body: Record<string, unknown>): Promise<unknown> } };
  server: { extend(fn: (app: Application) => void): void };
}

const AssistantBody = z.object({ question: z.string().trim().min(1).max(4_000) });

function responseText(response: unknown) {
  const value = response as { choices?: Array<{ message?: { content?: string } }> };
  return value.choices?.[0]?.message?.content ?? 'I could not generate a response from the configured model.';
}

export function setupAssistantRoutes(appkit: AssistantAppKit) {
  appkit.server.extend((app) => {
    app.post('/api/assistant', async (req, res) => {
      const parsed = AssistantBody.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: 'Ask a question to search your notes.' }); return; }
      if (!appkit.aiSearch || !appkit.serving) { res.status(503).json({ error: 'The assistant is not configured. Set the Vector Search index and serving endpoint.' }); return; }
      try {
        const db = appkit.lakebase.asUser(req);
        const identity = await db.query('SELECT current_user AS owner_email');
        const owner = identity.rows[0]?.owner_email;
        const ownerEmail = typeof owner === 'string' ? owner : '';
        if (!ownerEmail) { res.status(401).json({ error: 'Could not determine the signed-in user.' }); return; }
        const retrieval = await appkit.aiSearch.query('notes', { queryText: parsed.data.question, numResults: 6, filters: { owner_email: ownerEmail } });
        const sources = retrieval.results.map((result) => ({ noteId: Number(result.data.note_id), title: result.data.title ?? 'Untitled note', score: result.score }));
        const context = retrieval.results.map((result, index) => `[${index + 1}] ${result.data.title ?? 'Untitled'}\n${result.data.chunk_text ?? ''}`).join('\n\n');
        const completion = await appkit.serving('notes').asUser(req).invoke({
          messages: [
            { role: 'system', content: 'You are a private notes assistant. Answer only from the supplied excerpts. If the excerpts do not answer the question, say so. Cite excerpts using [1], [2], etc. Never claim to have changed a note.' },
            { role: 'user', content: `Question: ${parsed.data.question}\n\nPrivate note excerpts:\n${context || '(No matching notes found.)'}` },
          ],
        });
        res.json({ answer: responseText(completion), sources });
      } catch (error) { console.error('Assistant request failed:', error); res.status(502).json({ error: 'The assistant could not complete this request.' }); }
    });
  });
}
