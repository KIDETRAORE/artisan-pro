// apps/backend/src/routes/index.ts
import { Router } from "express";

import healthRoutes from "./health.routes";
import dashboardRoutes from "./dashboard.routes";
import { devisRouter } from "./devis.routes";
import stripeRoutes from "./stripe.routes";

import aiRoutes from "./ai.routes";
import assistantRoutes from "./assistant.routes";
import comptaRoutes from "./compta.routes";
import visionRoutes from "./vision.routes";
import vocalRoutes from "./vocal.routes";
import automationRoutes from "./automation.routes";

// ✅ AJOUT
import { usageRouter } from "./usage.routes";

// ✅ AJOUT: INVOICES
import invoicesRoutes from "./invoices.routes";

// ✅ AJOUT: CLIENTS
import clientsRoutes from "./clients.routes";

// ✅ AJOUT: INVOICE LINES
import invoiceLinesRoutes from "./invoiceLines.routes";

// ✅ AJOUT: PROJECTS
import projectsRoutes from "./projects.routes";

// ✅ AJOUT: PROJECT EXPENSES
import projectExpensesRoutes from "./projectExpenses.routes";

// ✅ AJOUT: INTEGRATIONS
import integrationsRoutes from "./integrations.routes";

// ✅ AJOUT: ERP WEBHOOKS
import erpWebhookRoutes from "./erp.webhook.routes";

// ✅ AJOUT: PROJECT ACCOUNTING IMPORT
import projectAccountingRoutes from "./projectAccounting.routes";

// ✅ AJOUT: QUOTES
import quotesRoutes from "./quotes.routes";

import { authMiddleware } from "@middlewares/auth.middleware";
import { requireRole } from "@middlewares/requireRole.middleware";
import { requirePermission } from "@middlewares/requirePermission.middleware";
import { PERMISSIONS } from "@auth/permissions";

import { quotaMiddleware } from "@middlewares/quota.middleware";

const router = Router();

/**
 * ============================
 * ROUTES TECHNIQUES (PUBLIC)
 * ============================
 */
router.use("/health", healthRoutes);

// ✅ AJOUT: ERP WEBHOOKS (PUBLIC)
router.use("/erp/webhooks", erpWebhookRoutes);

/**
 * ============================
 * STRIPE (AUTH)
 * ============================
 */
router.use("/stripe", authMiddleware, stripeRoutes);

/**
 * ============================
 * ROUTES BUSINESS (AUTH)
 * ============================
 */
router.use(
  "/dashboard",
  authMiddleware,
  requirePermission(PERMISSIONS.ACCESS_DASHBOARD),
  dashboardRoutes
);

router.use("/devis", authMiddleware, devisRouter);

// ✅ AJOUT: QUOTES (AUTH)
router.use("/quotes", authMiddleware, quotesRoutes);

// ✅ AJOUT: INVOICES (AUTH)
router.use("/invoices", authMiddleware, invoicesRoutes);

// ✅ AJOUT: INVOICE LINES (AUTH)
// On monte le router à la racine pour éviter de doubler "/invoice-lines"
// car invoiceLines.routes.ts expose déjà "/invoice-lines"
router.use("/", authMiddleware, invoiceLinesRoutes);

// ✅ AJOUT: CLIENTS (AUTH)
router.use("/clients", authMiddleware, clientsRoutes);

// ✅ AJOUT: PROJECTS (AUTH)
router.use("/projects", authMiddleware, projectsRoutes);

// ✅ AJOUT: PROJECT EXPENSES (AUTH)
// On monte aussi à la racine car projectExpenses.routes.ts expose déjà
// "/projects/:projectId/expenses" et "/project-expenses/:expenseId"
router.use("/", authMiddleware, projectExpensesRoutes);

// ✅ AJOUT: PROJECT ACCOUNTING IMPORT
// Ce router gère l'upload multer pour /projects/:projectId/import-accounting
router.use("/", projectAccountingRoutes);

// ✅ AJOUT: USAGE (AUTH)
router.use("/usage", authMiddleware, usageRouter);

// ✅ AJOUT: INTEGRATIONS (AUTH)
router.use("/integrations", authMiddleware, integrationsRoutes);

/**
 * ============================
 * MODULES IA
 * ============================
 */

// ✅ MODIF UNIQUE : /ai ne passe plus par quotaMiddleware
// -> permet à /ai/compta/latest et /ai/status/:jobId de rester en lecture
// -> /ai/run et /ai/chat gardent déjà leur pré-check quota dans ai.routes.ts
const aiBaseGuards = [
  authMiddleware,
  requirePermission(PERMISSIONS.AI_USE),
] as const;

// /ai/* : guards communs (le rate-limit spécifique /run est géré DANS ai.routes.ts)
router.use("/ai", ...aiBaseGuards, aiRoutes);

// Autres modules IA (inchangés, sans aiRateLimit global)
router.use(
  "/assistant",
  authMiddleware,
  requirePermission(PERMISSIONS.AI_USE),
  quotaMiddleware,
  assistantRoutes
);
router.use(
  "/compta",
  authMiddleware,
  requirePermission(PERMISSIONS.AI_USE),
  quotaMiddleware,
  comptaRoutes
);
router.use(
  "/vision",
  authMiddleware,
  requirePermission(PERMISSIONS.AI_USE),
  quotaMiddleware,
  visionRoutes
);
router.use(
  "/vocal",
  authMiddleware,
  requirePermission(PERMISSIONS.AI_USE),
  quotaMiddleware,
  vocalRoutes
);

/**
 * ✅ NOTE:
 * Les routes Expert sont montées directement dans app.ts via:
 * app.use("/ai/expert", expertRouter);
 * (évite de les monter 2 fois ici).
 */

/**
 * ============================
 * AUTOMATISATION (ADMIN ONLY)
 * ============================
 */
router.use(
  "/automation",
  authMiddleware,
  requireRole("admin"),
  requirePermission(PERMISSIONS.AUTOMATION_USE),
  quotaMiddleware,
  automationRoutes
);

export default router;