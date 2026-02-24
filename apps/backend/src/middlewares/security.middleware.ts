import helmet from "helmet";
import type { Express } from "express";
import { ENV } from "../config/env";

/**
 * Apply global security headers
 */
export function applySecurity(app: Express) {
  /**
   * ===============================
   * Base Helmet Protection
   * ===============================
   */
  app.use(
    helmet({
      frameguard: { action: "deny" }, // Anti clickjacking
      noSniff: true, // X-Content-Type-Options
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      crossOriginEmbedderPolicy: false, // évite casse Stripe / Supabase
    })
  );

  /**
   * ===============================
   * Content Security Policy (CSP)
   * ===============================
   * ⚠️ Ajuste si ton frontend évolue
   */
  app.use(
    helmet.contentSecurityPolicy({
      directives: {
        defaultSrc: ["'self'"],

        scriptSrc: [
          "'self'",
          "'unsafe-inline'", // ⚠️ idéalement à supprimer plus tard
          "https://js.stripe.com",
        ],

        styleSrc: [
          "'self'",
          "'unsafe-inline'",
        ],

        imgSrc: [
          "'self'",
          "data:",
          "blob:",
          "https:",
        ],

        connectSrc: [
          "'self'",
          ENV.FRONTEND_URL,
          "https://api.stripe.com",
          "https://*.supabase.co",
        ],

        frameSrc: [
          "https://js.stripe.com",
          "https://hooks.stripe.com",
        ],

        objectSrc: ["'none'"],

        upgradeInsecureRequests:
          ENV.NODE_ENV === "production" ? [] : null,
      },
    })
  );

  /**
   * ===============================
   * HSTS (Prod uniquement)
   * ===============================
   */
  if (ENV.NODE_ENV === "production") {
    app.use(
      helmet.hsts({
        maxAge: 31536000, // 1 an
        includeSubDomains: true,
        preload: true,
      })
    );
  }
}