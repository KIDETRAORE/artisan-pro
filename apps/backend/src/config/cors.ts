import cors, { CorsOptions } from "cors";

/**
 * Origines autorisées
 * ⚠️ En prod, TOUJOURS via variables d'environnement
 */
const allowedOrigins = (
  process.env.CORS_ORIGIN || "http://localhost:5173"
)
  .split(",")
  .map(origin => origin.trim());

const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Autorise les appels sans origin (Postman, curl, mobile app)
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(
      new Error(`CORS blocked for origin: ${origin}`)
    );
  },

  credentials: true, // ⬅️ OBLIGATOIRE pour cookies httpOnly
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
  ],
  exposedHeaders: ["Authorization"],
  maxAge: 86400, // cache preflight 24h
};

export default cors(corsOptions);
