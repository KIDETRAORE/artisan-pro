import { RedisOptions } from "ioredis";

// On exporte uniquement les options pour BullMQ
export const redisOptions: RedisOptions = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: Number(process.env.REDIS_PORT) || 6379,
  maxRetriesPerRequest: null, // Indispensable pour BullMQ
};

// On peut garder l'instance pour d'autres usages (cache, etc.)
// import { Redis } from "ioredis";
// export const redisConnection = new Redis(redisOptions);