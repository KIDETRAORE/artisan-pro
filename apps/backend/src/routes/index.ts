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

import { usageRouter } from "./usage.routes";

import invoicesRoutes from "./invoices.routes";
import clientsRoutes from "./clients.routes";
import invoiceLinesRoutes from "./invoiceLines.routes";
import projectsRoutes from "./projects.routes";
import projectExpensesRoutes from "./projectExpenses.routes";
import integrationsRoutes from "./integrations.routes";
import erpWebhookRoutes from "./erp.webhook.routes";
import projectAccountingRoutes from "./projectAccounting.routes";
import quotesRoutes from "./quotes.routes";
import salesInvoicesRoutes from "./salesInvoices.routes";
import purchaseBillsRoutes from "./purchaseBills.routes";
import paymentsRoutes from "./payments.routes";

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

/**
 * ERP WEBHOOKS (PUBLIC)
 */
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

/**
 * QUOTES
 */
router.use("/quotes", authMiddleware, quotesRoutes);

/**
 * INVOICES
 */
router.use("/invoices", authMiddleware, invoicesRoutes);

/**
 * SALES INVOICES (canonical accounting model)
 */
router.use("/sales-invoices", authMiddleware, salesInvoicesRoutes);

/**
 * PURCHASE BILLS
 */
router.use("/purchase-bills", authMiddleware, purchaseBillsRoutes);

/**
 * PAYMENTS
 */
router.use("/payments", authMiddleware, paymentsRoutes);

/**
 * INVOICE LINES
 * Router expose déjà /invoice-lines
 */
router.use("/", authMiddleware, invoiceLinesRoutes);

/**
 * CLIENTS
 */
router.use("/clients", authMiddleware, clientsRoutes);

/**
 * PROJECTS
 */
router.use("/projects", authMiddleware, projectsRoutes);

/**
 * PROJECT EXPENSES
 */
router.use("/", authMiddleware, projectExpensesRoutes);

/**
 * PROJECT ACCOUNTING IMPORT
 */
router.use("/", authMiddleware, projectAccountingRoutes);

/**
 * USAGE
 */
router.use("/usage", authMiddleware, usageRouter);

/**
 * INTEGRATIONS
 */
router.use("/integrations", authMiddleware, integrationsRoutes);

/**
 * ============================
 * MODULES IA
 * ============================
 */

const aiBaseGuards = [
  authMiddleware,
  requirePermission(PERMISSIONS.AI_USE),
] as const;

router.use("/ai", ...aiBaseGuards, aiRoutes);

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
 * NOTE :
 * Les routes Expert sont montées directement dans app.ts :
 * app.use("/ai/expert", expertRouter);
 */

/**
 * ============================
 * AUTOMATION (ADMIN ONLY)
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