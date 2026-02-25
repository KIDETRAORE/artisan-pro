import { logger } from "../utils/logger";

logger.info("👷 [WORKERS] bootstrap starting");

// side-effect imports: ces fichiers démarrent les Workers BullMQ
import "./ai.worker";
// import "./reminder.worker";

logger.info("👷 [WORKERS] bootstrap loaded");