import { createApp, lakebase, server, serving } from '@databricks/appkit';
import { aiSearch } from '@databricks/appkit/beta';
import { setupAssistantRoutes } from './routes/assistant-routes';
import { setupNotesRoutes } from './routes/notes-routes';

const ragEnabled = Boolean(process.env.DATABRICKS_VS_INDEX_NAME && process.env.DATABRICKS_SERVING_ENDPOINT_NAME);
const ragPlugins = ragEnabled ? [
  aiSearch({ indexes: { notes: { indexName: process.env.DATABRICKS_VS_INDEX_NAME, columns: ['owner_email', 'note_id', 'title', 'chunk_text'], queryType: 'hybrid', numResults: 6 } } }),
  serving({ endpoints: { notes: { env: 'DATABRICKS_SERVING_ENDPOINT_NAME' } } }),
] : [];

createApp({
  plugins: [
    server(),
    lakebase(),
    ...ragPlugins,
  ],
  async onPluginsReady(appkit) {
    await setupNotesRoutes(appkit);
    setupAssistantRoutes(appkit);
  },
}).catch(console.error);
