import app from "./src/app.js";
import { initializeCleanupWorker } from "./src/workers/cleanup.worker.js";

const PORT = process.env.PORT || 4000;

initializeCleanupWorker();

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
