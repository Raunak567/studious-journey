import {
  createApp,
  lakebase,
  server,
} from "@databricks/appkit";

import {
  setupKnowledgeBaseRoutes,
} from "./routes/knowledge-base";

createApp({
  plugins: [
    lakebase(),
    server(),
  ],

  async onPluginsReady(appkit) {
    await setupKnowledgeBaseRoutes(appkit);
  },
}).catch(console.error);