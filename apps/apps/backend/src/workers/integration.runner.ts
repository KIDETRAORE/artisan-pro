// apps/backend/src/workers/integration.runner.ts
import { logger } from "../utils/logger";

// Import side-effect: instancie et démarre le worker
import "./integration.worker";

logger.info("🚀 [WORKER-INTEGRATION] Runner started");