// apps/backend/src/controllers/projects.controller.ts
import type { Request, Response } from "express";
import { z } from "zod";
import { requireUser } from "../utils/requireUser";
import { HttpError } from "../utils/httpError";
import { ProjectsService } from "../services/projects.service";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { logger } from "../utils/logger";

const ProjectIdSchema = z.string().uuid();

const CreateProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  status: z.string().optional().default("active"),
});

const UpdateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  status: z.string().optional(),
});

function centsToEuros(cents: number): number {
  return Math.round(cents) / 100;
}

export class ProjectsController {
  /**
   * GET /projects
   */
  static async list(req: Request, res: Response) {
    const user = requireUser(req);

    const { data, error } = await supabaseAdmin
      .from("projects")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      logger.error("ProjectsController.list failed", {
        userId: user.id,
        message: error.message,
      });
      throw new HttpError(500, "Failed to list projects");
    }

    return res.status(200).json({
      success: true,
      projects: data ?? [],
    });
  }

  /**
   * POST /projects
   */
  static async create(req: Request, res: Response) {
    const user = requireUser(req);

    const parsed = CreateProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, "Invalid project payload");
    }

    const payload = parsed.data;

    const { data, error } = await supabaseAdmin
      .from("projects")
      .insert({
        user_id: user.id,
        name: payload.name,
        description: payload.description ?? null,
        status: payload.status ?? "active",
      })
      .select("*")
      .single();

    if (error) {
      logger.error("ProjectsController.create failed", {
        userId: user.id,
        message: error.message,
      });
      throw new HttpError(500, "Failed to create project");
    }

    return res.status(201).json({
      success: true,
      project: data,
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

    const parsed = UpdateProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, "Invalid project payload");
    }

    // ownership check
    await ProjectsService.getProject(user.id, projectId.data);

    const { data, error } = await supabaseAdmin
      .from("projects")
      .update({
        ...parsed.data,
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId.data)
      .eq("user_id", user.id)
      .select("*")
      .single();

    if (error) {
      logger.error("ProjectsController.update failed", {
        userId: user.id,
        projectId: projectId.data,
        message: error.message,
      });
      throw new HttpError(500, "Failed to update project");
    }

    return res.status(200).json({
      success: true,
      project: data,
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

    // ownership check
    await ProjectsService.getProject(user.id, projectId.data);

    const { error } = await supabaseAdmin
      .from("projects")
      .delete()
      .eq("id", projectId.data)
      .eq("user_id", user.id);

    if (error) {
      logger.error("ProjectsController.remove failed", {
        userId: user.id,
        projectId: projectId.data,
        message: error.message,
      });
      throw new HttpError(500, "Failed to delete project");
    }

    return res.status(200).json({
      success: true,
    });
  }

  /**
   * GET /projects/:id/analytics
   * Retour:
   * { revenue_cents, expenses_cents, profit_cents, profitability_rate }
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
   * IA "best effort" : on produit une analyse textuelle à partir des chiffres.
   */
  static async insights(req: Request, res: Response) {
    const user = requireUser(req);

    const projectId = ProjectIdSchema.safeParse(req.params.id);
    if (!projectId.success) {
      throw new HttpError(400, "Invalid project id");
    }

    const project = await ProjectsService.getProject(user.id, projectId.data);
    const analytics = await ProjectsService.getAnalytics(user.id, projectId.data);

    const revenue = analytics.revenue_cents;
    const expenses = analytics.expenses_cents;
    const profit = analytics.profit_cents;
    const rate = analytics.profitability_rate;

    const issues: string[] = [];
    const actions: string[] = [];

    if (revenue === 0) {
      issues.push("Aucun chiffre d’affaires n’est rattaché à ce chantier.");
      actions.push(
        "Finaliser et envoyer les factures du chantier (status: sent), puis suivre le paiement."
      );
    } else {
      if (rate < 15) {
        issues.push("Rentabilité très faible : marge < 15%.");
        actions.push(
          "Revoir ton prix de vente (devis) sur ce type de chantier (+8% à +15%)."
        );
        actions.push(
          "Contrôler les postes coûteux : matériaux, sous-traitance, déplacements."
        );
      } else if (rate < 30) {
        issues.push("Rentabilité moyenne : marge entre 15% et 30%.");
        actions.push(
          "Ajouter une marge sécurité (imprévus) sur les prochains devis (+5% à +10%)."
        );
        actions.push(
          "Standardiser une grille de prix par prestation pour réduire la sous-facturation."
        );
      } else {
        actions.push(
          "Rentabilité bonne : capitalise sur ce type de chantier (même prix, mêmes conditions)."
        );
      }

      if (expenses > revenue) {
        issues.push("Les dépenses dépassent le facturé : chantier déficitaire.");
        actions.push(
          "Vérifier les dépenses non prévues et renégocier / refacturer si possible."
        );
      }

      if (profit <= 0 && revenue > 0) {
        issues.push("Marge nulle ou négative : tu travailles à perte sur ce chantier.");
        actions.push(
          "Ajouter systématiquement une ligne 'imprévus' sur devis, ou augmenter le taux horaire."
        );
      }
    }

    let suggestedPriceIncreasePct: number | null = null;
    if (revenue > 0 && rate < 30) {
      const targetRevenue = Math.round(expenses / 0.7);
      const delta = targetRevenue - revenue;
      if (delta > 0) {
        suggestedPriceIncreasePct = Math.round((delta / revenue) * 100);
      }
    }

    const insight = {
      title: `Analyse chantier — ${project.name}`,
      summary: {
        revenue_eur: centsToEuros(revenue),
        expenses_eur: centsToEuros(expenses),
        profit_eur: centsToEuros(profit),
        profitability_rate: rate,
      },
      issues,
      actions,
      recommendation:
        suggestedPriceIncreasePct != null
          ? `Conseil IA : augmenter le prix de ce type de chantier d’environ ${suggestedPriceIncreasePct}% pour viser ~30% de marge.`
          : "Conseil IA : garder un suivi régulier des dépenses et finaliser les factures dès que les prestations sont terminées.",
    };

    logger.info("ProjectsController.insights generated", {
      userId: user.id,
      projectId: project.id,
    });

    return res.status(200).json({
      success: true,
      insight,
    });
  }
}