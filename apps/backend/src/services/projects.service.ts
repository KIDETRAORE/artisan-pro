// apps/backend/src/services/projects.service.ts
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { HttpError } from "../utils/httpError";
import { logger } from "../utils/logger";

export type ProjectRow = {
  id: string;
  user_id: string;
  name: string;
  client_name: string | null;
  address: string | null;
  status: string;
  budget_cents: number | null;
  created_at: string;
};

export type ProjectAnalytics = {
  revenue_cents: number;
  paid_cents: number;
  expenses_cents: number;
  profit_cents: number;
  profitability_rate: number;
};

const CreateProjectSchema = z.object({
  name: z.string().min(1),
  client_name: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  status: z.string().optional().default("active"),
  budget_cents: z.number().int().nonnegative().optional().nullable(),
});

const UpdateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  client_name: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  status: z.string().optional(),
  budget_cents: z.number().int().nonnegative().optional().nullable(),
});

function toInt(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? Math.trunc(v) : 0;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : 0;
  }
  return 0;
}

function toFloat(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export class ProjectsService {
  static async listProjects(userId: string): Promise<ProjectRow[]> {
    const { data, error } = await supabaseAdmin
      .from("projects")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      logger.error("ProjectsService.listProjects failed", {
        userId,
        message: error.message,
      });
      throw new HttpError(500, "Failed to list projects");
    }

    return (data ?? []) as ProjectRow[];
  }

  static async createProject(userId: string, input: unknown): Promise<ProjectRow> {
    const parsed = CreateProjectSchema.safeParse(input);
    if (!parsed.success) {
      throw new HttpError(400, "Invalid project payload");
    }

    const payload = parsed.data;

    const { data, error } = await supabaseAdmin
      .from("projects")
      .insert({
        user_id: userId,
        name: payload.name,
        client_name: payload.client_name ?? null,
        address: payload.address ?? null,
        status: payload.status ?? "active",
        budget_cents: payload.budget_cents ?? null,
      })
      .select("*")
      .single();

    if (error) {
      logger.error("ProjectsService.createProject failed", {
        userId,
        message: error.message,
      });
      throw new HttpError(500, "Failed to create project");
    }

    return data as ProjectRow;
  }

  static async getProject(userId: string, projectId: string): Promise<ProjectRow> {
    const { data, error } = await supabaseAdmin
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      logger.error("ProjectsService.getProject failed", {
        userId,
        projectId,
        message: error.message,
      });
      throw new HttpError(500, "Failed to load project");
    }

    if (!data) {
      throw new HttpError(404, "Project not found");
    }

    return data as ProjectRow;
  }

  static async updateProject(
    userId: string,
    projectId: string,
    input: unknown
  ): Promise<ProjectRow> {
    const parsed = UpdateProjectSchema.safeParse(input);
    if (!parsed.success) {
      throw new HttpError(400, "Invalid project payload");
    }

    await ProjectsService.getProject(userId, projectId);

    const patch = parsed.data;

    const { data, error } = await supabaseAdmin
      .from("projects")
      .update(patch)
      .eq("id", projectId)
      .eq("user_id", userId)
      .select("*")
      .single();

    if (error) {
      logger.error("ProjectsService.updateProject failed", {
        userId,
        projectId,
        message: error.message,
      });
      throw new HttpError(500, "Failed to update project");
    }

    return data as ProjectRow;
  }

  static async deleteProject(userId: string, projectId: string): Promise<void> {
    await ProjectsService.getProject(userId, projectId);

    const { error } = await supabaseAdmin
      .from("projects")
      .delete()
      .eq("id", projectId)
      .eq("user_id", userId);

    if (error) {
      logger.error("ProjectsService.deleteProject failed", {
        userId,
        projectId,
        message: error.message,
      });
      throw new HttpError(500, "Failed to delete project");
    }
  }

  static async getAnalytics(userId: string, projectId: string): Promise<ProjectAnalytics> {
    // sécurité: le projet doit appartenir au user
    await ProjectsService.getProject(userId, projectId);

    const { data, error } = await supabaseAdmin.rpc("get_project_analytics", {
      p_user_id: userId,
      p_project_id: projectId,
    });

    if (error) {
      logger.error("ProjectsService.getAnalytics rpc failed", {
        userId,
        projectId,
        message: error.message,
      });
      throw new HttpError(500, "Failed to compute project analytics");
    }

    const row = Array.isArray(data) ? data[0] : data;

    return {
      revenue_cents: toInt((row as any)?.revenue_cents),
      paid_cents: toInt((row as any)?.paid_cents),
      expenses_cents: toInt((row as any)?.expenses_cents),
      profit_cents: toInt((row as any)?.profit_cents),
      profitability_rate: toFloat((row as any)?.profitability_rate),
    };
  }
}