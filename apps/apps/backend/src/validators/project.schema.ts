// apps/backend/src/validators/project.schema.ts
import { z } from "zod";

export const ProjectIdSchema = z.string().uuid();

export const CreateProjectSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  client_name: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  status: z.string().optional().default("active"),
  budget_cents: z.number().int().nonnegative().optional().nullable(),
});

export const UpdateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  client_name: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  status: z.string().optional(),
  budget_cents: z.number().int().nonnegative().optional().nullable(),
});

export const ProjectRowSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  name: z.string(),
  client_name: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  status: z.string(),
  budget_cents: z.number().int().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string().optional().nullable(),
});

export const ProjectHealthStatusSchema = z.enum([
  "healthy",
  "warning",
  "critical",
]);

export const ProjectAlertSchema = z.object({
  code: z.enum([
    "no_revenue",
    "budget_exceeded",
    "budget_high_consumption",
    "negative_margin",
    "low_margin",
  ]),
  level: z.enum(["info", "warning", "critical"]),
  message: z.string(),
});

export const ProjectAnalyticsSchema = z.object({
  revenue_cents: z.number().int(),
  paid_cents: z.number().int(),
  expenses_cents: z.number().int(),
  profit_cents: z.number().int(),
  profitability_rate: z.number(),
  budget_cents: z.number().int(),
  remaining_budget_cents: z.number().int(),
  budget_consumed_rate: z.number(),
  health_status: ProjectHealthStatusSchema,
  alerts: z.array(ProjectAlertSchema),
});

export type ProjectId = z.infer<typeof ProjectIdSchema>;
export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;
export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>;
export type ProjectRow = z.infer<typeof ProjectRowSchema>;
export type ProjectHealthStatus = z.infer<typeof ProjectHealthStatusSchema>;
export type ProjectAlert = z.infer<typeof ProjectAlertSchema>;
export type ProjectAnalytics = z.infer<typeof ProjectAnalyticsSchema>;