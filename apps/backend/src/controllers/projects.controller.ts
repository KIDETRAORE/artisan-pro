// apps/backend/src/controllers/projects.controller.ts
import type { Request, Response } from "express";
import { z } from "zod";
import { requireUser } from "../utils/requireUser";
import { HttpError } from "../utils/httpError";
import { ProjectsService } from "../services/projects.service";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { logger } from "../utils/logger";

const ProjectIdSchema = z.string().uuid();

function centsToEuros(cents: number): number {
  return Math.round(cents) / 100;
}

function formatEuros(cents: number): string {
  return `${(Math.round(cents) / 100).toFixed(2).replace(".", ",")} €`;
}

function getInvoiceAmountCents(invoice: {
  total_amount_cents?: unknown;
  total_amount?: unknown;
}): number {
  const totalAmountCents =
    typeof invoice.total_amount_cents === "number"
      ? invoice.total_amount_cents
      : typeof invoice.total_amount === "number"
        ? Math.round(invoice.total_amount * 100)
        : 0;

  return Number.isFinite(totalAmountCents) ? totalAmountCents : 0;
}

function categoryLabel(
  category: "materials" | "labor" | "equipment" | "transport" | "other"
): string {
  if (category === "materials") return "matériaux";
  if (category === "labor") return "main d’œuvre / sous-traitance";
  if (category === "equipment") return "équipement / location";
  if (category === "transport") return "transport / déplacements";
  return "autres charges";
}

export class ProjectsController {
  /**
   * GET /projects
   */
  static async list(req: Request, res: Response) {
    const user = requireUser(req);

    const projects = await ProjectsService.listProjects(user.id);

    return res.status(200).json({
      success: true,
      projects,
    });
  }

  /**
   * POST /projects
   */
  static async create(req: Request, res: Response) {
    const user = requireUser(req);

    const project = await ProjectsService.createProject(user.id, req.body);

    return res.status(201).json({
      success: true,
      project,
    });
  }

  /**
   * GET /projects/:id
   */
  static async get(req: Request, res: Response) {
    const user = requireUser(req);

    const projectId = ProjectIdSchema.safeParse(req.params.id);
    if (!projectId.success) {
      throw new HttpError(400, "Invalid project id");
    }

    const project = await ProjectsService.getProject(user.id, projectId.data);

    return res.status(200).json({
      success: true,
      project,
    });
  }

  /**
   * PATCH /projects/:id
   */
  static async update(req: Request, res: Response) {
    const user = requireUser(req);

    const projectId = ProjectIdSchema.safeParse(req.params.id);
    if (!projectId.success) {
      throw new HttpError(400, "Invalid project id");
    }

    const project = await ProjectsService.updateProject(
      user.id,
      projectId.data,
      req.body
    );

    return res.status(200).json({
      success: true,
      project,
    });
  }

  /**
   * DELETE /projects/:id
   */
  static async remove(req: Request, res: Response) {
    const user = requireUser(req);

    const projectId = ProjectIdSchema.safeParse(req.params.id);
    if (!projectId.success) {
      throw new HttpError(400, "Invalid project id");
    }

    await ProjectsService.deleteProject(user.id, projectId.data);

    return res.status(200).json({
      success: true,
    });
  }

  /**
   * GET /projects/:id/analytics
   */
  static async analytics(req: Request, res: Response) {
    const user = requireUser(req);

    const projectId = ProjectIdSchema.safeParse(req.params.id);
    if (!projectId.success) {
      throw new HttpError(400, "Invalid project id");
    }

    const analytics = await ProjectsService.getAnalytics(user.id, projectId.data);

    return res.status(200).json({
      success: true,
      analytics,
    });
  }

  /**
   * GET /projects/:id/insights
   * IA chantier "best effort" à partir des analytics + factures + dépenses.
   */
  static async insights(req: Request, res: Response) {
    const user = requireUser(req);

    const projectId = ProjectIdSchema.safeParse(req.params.id);
    if (!projectId.success) {
      throw new HttpError(400, "Invalid project id");
    }

    const project = await ProjectsService.getProject(user.id, projectId.data);
    const analytics = await ProjectsService.getAnalytics(user.id, projectId.data);

    const { data: invoices, error: invoicesError } = await supabaseAdmin
      .from("invoices")
      .select("id, status, due_date, created_at, total_amount_cents, total_amount")
      .eq("user_id", user.id)
      .eq("project_id", projectId.data)
      .order("created_at", { ascending: false });

    if (invoicesError) {
      logger.error("ProjectsController.insights invoices query failed", {
        userId: user.id,
        projectId: projectId.data,
        message: invoicesError.message,
      });
      throw new HttpError(500, "Failed to load project invoices");
    }

    const { data: expenses, error: expensesError } = await supabaseAdmin
      .from("project_expenses")
      .select("id, description, amount_cents, expense_date, created_at")
      .eq("user_id", user.id)
      .eq("project_id", projectId.data)
      .order("created_at", { ascending: false });

    if (expensesError) {
      logger.error("ProjectsController.insights expenses query failed", {
        userId: user.id,
        projectId: projectId.data,
        message: expensesError.message,
      });
      throw new HttpError(500, "Failed to load project expenses");
    }

    const revenue = analytics.revenue_cents;
    const expensesCents = analytics.expenses_cents;
    const profit = analytics.profit_cents;
    const rate = analytics.profitability_rate;
    const budgetCents = analytics.budget_cents;
    const remainingBudgetCents = analytics.remaining_budget_cents;
    const budgetConsumedRate = analytics.budget_consumed_rate;

    const issues: string[] = [];
    const actions: string[] = [];
    const findings: string[] = [];

    const now = Date.now();
    const invoiceRows = (invoices ?? []) as Array<{
      id: string;
      status: string | null;
      due_date: string | null;
      created_at: string | null;
      total_amount_cents?: number | null;
      total_amount?: number | null;
    }>;

    const expenseRows = (expenses ?? []) as Array<{
      id: string;
      description: string | null;
      amount_cents: number | null;
      expense_date: string | null;
      created_at: string | null;
    }>;

    const draftInvoices = invoiceRows.filter(
      (invoice) => String(invoice.status ?? "").toLowerCase() === "draft"
    );

    const overdueInvoices = invoiceRows.filter((invoice) => {
      const status = String(invoice.status ?? "").toLowerCase();
      if (status === "overdue") return true;
      if (!invoice.due_date) return false;
      return (
        status !== "paid" &&
        Number.isFinite(Date.parse(invoice.due_date)) &&
        Date.parse(invoice.due_date) < now
      );
    });

    const totalDraftAmountCents = draftInvoices.reduce(
      (sum, invoice) => sum + getInvoiceAmountCents(invoice),
      0
    );

    if (revenue > 0 && profit < 0) {
      findings.push(
        `Le chantier est à perte avec une marge de ${formatEuros(profit)}.`
      );
      issues.push("Le chantier est actuellement déficitaire.");
      actions.push(
        "Vérifier immédiatement les postes coûteux et stopper toute dérive de dépenses."
      );
      actions.push(
        "Réévaluer le prix de vente, renégocier les travaux complémentaires ou facturer les imprévus."
      );
    } else if (revenue > 0 && rate < 15) {
      findings.push(
        `La marge est très faible (${rate.toFixed(2).replace(".", ",")}%).`
      );
      issues.push("La rentabilité du chantier est fragile.");
      actions.push(
        "Sécuriser les prochains devis avec une marge complémentaire de 5% à 10%."
      );
    }

    if (expensesCents > 0 && revenue === 0) {
      findings.push(
        "Des dépenses existent mais aucun chiffre d’affaires n’est encore rattaché à ce chantier."
      );
      issues.push("La facturation semble en retard.");
      actions.push(
        "Créer ou finaliser rapidement une première facture pour sécuriser la trésorerie du chantier."
      );
    } else if (draftInvoices.length > 0 && totalDraftAmountCents > 0) {
      findings.push(
        `${draftInvoices.length} facture(s) brouillon restent à finaliser pour ${formatEuros(
          totalDraftAmountCents
        )}.`
      );
      issues.push("Une partie de la facturation n’est pas encore finalisée.");
      actions.push(
        "Finaliser les factures brouillon liées au chantier pour accélérer l’encaissement."
      );
    }

    if (overdueInvoices.length > 0) {
      findings.push(
        `${overdueInvoices.length} facture(s) du chantier sont en retard de paiement.`
      );
      issues.push(
        "Le chantier présente un risque de trésorerie lié aux retards d’encaissement."
      );
      actions.push(
        "Lancer une relance client et vérifier les échéances de paiement du chantier."
      );
    }

    if (expenseRows.length >= 3) {
      const expenseAmounts = expenseRows.map((expense) =>
        Math.max(0, Number(expense.amount_cents ?? 0))
      );
      const avgExpenseCents =
        expenseAmounts.reduce((sum, amount) => sum + amount, 0) /
        expenseAmounts.length;

      const firstExpense = expenseRows[0];
      if (firstExpense) {
        const maxExpense = expenseRows.reduce((max, expense) =>
          Number(expense.amount_cents ?? 0) > Number(max.amount_cents ?? 0)
            ? expense
            : max,
          firstExpense
        );

        const maxExpenseCents = Math.max(0, Number(maxExpense.amount_cents ?? 0));
        const anomalyThreshold = Math.max(50000, Math.round(avgExpenseCents * 2));

        if (maxExpenseCents >= anomalyThreshold && avgExpenseCents > 0) {
          const ratio = maxExpenseCents / avgExpenseCents;
          findings.push(
            `Une dépense anormale a été détectée : ${formatEuros(
              maxExpenseCents
            )} sur "${maxExpense.description ?? "dépense"}", soit ${ratio
              .toFixed(1)
              .replace(".", ",")}x la moyenne du chantier.`
          );
          issues.push(
            "Le chantier présente une dépense significativement supérieure à la moyenne."
          );
          actions.push(
            "Contrôler cette dépense, vérifier si elle était prévue au devis ou si elle doit être refacturée."
          );
        }
      }
    }

    const expensesByCategory = analytics.expenses_by_category;
    const dominantCategory = analytics.dominant_expense_category;

    const categoryEntries = Object.entries(expensesByCategory) as Array<
      ["materials" | "labor" | "equipment" | "transport" | "other", number]
    >;

    const materialsAmount = expensesByCategory.materials;
    const laborAmount = expensesByCategory.labor;
    const equipmentAmount = expensesByCategory.equipment;
    const transportAmount = expensesByCategory.transport;

    if (expensesCents > 0 && dominantCategory) {
      const dominantAmount = expensesByCategory[dominantCategory];
      const dominantShare = (dominantAmount / expensesCents) * 100;

      findings.push(
        `Le poste dominant du chantier est ${categoryLabel(
          dominantCategory
        )} avec ${dominantShare.toFixed(1).replace(".", ",")}% des dépenses.`
      );

      if (dominantCategory === "materials" && dominantShare >= 50) {
        issues.push("Les matériaux pèsent fortement dans le coût total du chantier.");
        actions.push(
          "Vérifier les achats matériaux, les pertes, et comparer avec le devis initial."
        );
      }

      if (dominantCategory === "labor" && dominantShare >= 45) {
        issues.push(
          "La main d’œuvre / sous-traitance représente une part très importante du chantier."
        );
        actions.push(
          "Contrôler les heures, les prestations sous-traitées et la marge restante sur l’exécution."
        );
      }

      if (dominantCategory === "equipment" && dominantShare >= 30) {
        issues.push("L’équipement / la location matériel pèse lourd dans le budget chantier.");
        actions.push(
          "Vérifier si la location matériel reste rentable par rapport à l’avancement réel du chantier."
        );
      }

      if (dominantCategory === "transport" && dominantShare >= 20) {
        issues.push("Les frais de transport sont élevés pour ce chantier.");
        actions.push(
          "Optimiser les déplacements, livraisons et regroupements d’interventions."
        );
      }
    }

    if (expensesCents > 0 && materialsAmount / expensesCents >= 0.6) {
      findings.push(
        `Les matériaux représentent ${(
          (materialsAmount / expensesCents) *
          100
        )
          .toFixed(1)
          .replace(".", ",")}% des dépenses du chantier.`
      );
    }

    if (expensesCents > 0 && laborAmount / expensesCents >= 0.5) {
      findings.push(
        `La main d’œuvre / sous-traitance représente ${(
          (laborAmount / expensesCents) *
          100
        )
          .toFixed(1)
          .replace(".", ",")}% des dépenses du chantier.`
      );
    }

    if (expensesCents > 0 && equipmentAmount / expensesCents >= 0.35) {
      findings.push(
        `L’équipement / location matériel représente ${(
          (equipmentAmount / expensesCents) *
          100
        )
          .toFixed(1)
          .replace(".", ",")}% des dépenses du chantier.`
      );
    }

    if (expensesCents > 0 && transportAmount / expensesCents >= 0.2) {
      findings.push(
        `Le transport représente ${(
          (transportAmount / expensesCents) *
          100
        )
          .toFixed(1)
          .replace(".", ",")}% des dépenses du chantier.`
      );
    }

    if (
      categoryEntries.filter(([, amount]) => amount > 0).length >= 3 &&
      expensesCents > 0
    ) {
      actions.push(
        "Comparer la structure des dépenses par catégorie avec tes chantiers rentables pour détecter les dérives."
      );
    }

    if (budgetCents > 0 && budgetConsumedRate >= 85) {
      findings.push(
        `Le chantier a consommé ${budgetConsumedRate
          .toFixed(1)
          .replace(".", ",")}% de son budget.`
      );
      if (remainingBudgetCents < 0) {
        issues.push("Le budget chantier est dépassé.");
        actions.push(
          "Bloquer les dépenses non essentielles et recalculer immédiatement la marge restante."
        );
      } else {
        issues.push("Le budget chantier est presque consommé.");
        actions.push(
          "Surveiller chaque nouvelle dépense et arbitrer les achats restants."
        );
      }
    }

    if (findings.length === 0) {
      findings.push(
        "Le chantier ne présente pas de signal de risque majeur à ce stade."
      );
      actions.push(
        "Continuer le suivi hebdomadaire du budget, des dépenses et des factures."
      );
    }

    let risk_level: "low" | "medium" | "high" = "low";

    if (
      profit < 0 ||
      overdueInvoices.length > 0 ||
      (budgetCents > 0 && remainingBudgetCents < 0)
    ) {
      risk_level = "high";
    } else if (
      rate < 30 ||
      (expensesCents > 0 && revenue === 0) ||
      draftInvoices.length > 0 ||
      budgetConsumedRate >= 85
    ) {
      risk_level = "medium";
    }

    const recommendation =
      risk_level === "high"
        ? "Conseil IA : ce chantier doit être traité en priorité. Réduis les dépenses non essentielles, finalise les factures en attente et sécurise l’encaissement client."
        : risk_level === "medium"
          ? "Conseil IA : le chantier reste maîtrisable, mais il faut accélérer la facturation et surveiller étroitement les dépenses."
          : "Conseil IA : le chantier semble sain. Maintiens un suivi régulier des dépenses et facture sans délai les prestations terminées.";

    const insight = {
      title: `Analyse chantier — ${project.name}`,
      risk_level,
      summary: {
        revenue_eur: centsToEuros(revenue),
        expenses_eur: centsToEuros(expensesCents),
        profit_eur: centsToEuros(profit),
        profitability_rate: rate,
        budget_eur: centsToEuros(budgetCents),
        remaining_budget_eur: centsToEuros(remainingBudgetCents),
      },
      findings,
      issues,
      actions,
      recommendation,
    };

    logger.info("ProjectsController.insights generated", {
      userId: user.id,
      projectId: project.id,
      riskLevel: risk_level,
    });

    return res.status(200).json({
      success: true,
      insight,
    });
  }
}