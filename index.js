import app from "./src/app.js";
import { initializeCleanupWorker } from "./src/workers/cleanup.worker.js";

const PORT = process.env.PORT || 4000;
const HOST = "0.0.0.0";

initializeCleanupWorker();

app.listen(PORT, HOST, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Server running on network at http://192.168.18.30:${PORT}`);
});
