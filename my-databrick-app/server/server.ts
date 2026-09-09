import { createApp, lakebase, server, serving } from '@databricks/appkit';
import { setupAssistantRoutes } from './routes/assistant-routes';
import { setupNotesRoutes } from './routes/notes-routes';

createApp({
  plugins: [
    server(),
    lakebase(),
    serving({ endpoints: {
      chat: { env: 'DATABRICKS_SERVING_ENDPOINT_NAME' },
      embeddings: { env: 'DATABRICKS_EMBEDDING_ENDPOINT_NAME' },
    } }),
  ],
  async onPluginsReady(appkit) {
    await setupNotesRoutes(appkit);
    setupAssistantRoutes(appkit);
  },
}).catch(console.error);
