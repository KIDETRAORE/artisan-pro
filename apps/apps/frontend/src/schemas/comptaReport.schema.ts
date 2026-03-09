// apps/frontend/src/schemas/comptaReport.schema.ts
import { z } from "zod";

/**
 * Helpers formats
 */
const IsoDateTime = z.string().refine(
  (v: string) => !Number.isNaN(Date.parse(v)),
  "generatedAt must be a valid ISO datetime string"
);

const YearMonth = z.string().regex(/^\d{4}-\d{2}$/, "month must be YYYY-MM");

/**
 * Severity aligned with your report needs
 */
const AnomalySeverity = z.enum(["info", "warn", "critical"]);

export const ComptaReportSchema = z.object({
  meta: z.object({
    currency: z.string().default("EUR"),
    sourceFileName: z
      .string()
      .optional()
      .nullable()
      .transform((v) => (v == null ? undefined : v)),
    generatedAt: IsoDateTime,
    sheets: z.array(z.string()),
    rowsTotal: z.number(),
  }),

  totals: z.object({
    recettesHT: z.number(),
    recettesTTC: z.number(),
    depensesHT: z.number(),
    depensesTTC: z.number(),
    resultatNet: z.number(),
  }),

  tva: z.object({
    collectee: z.number(),
    deductible: z.number(),
    aPayer: z.number(),
    parTaux: z
      .array(
        z.object({
          taux: z.number(),
          baseHT: z.number(),
          tva: z.number(),
          type: z.enum(["vente", "achat"]),
        })
      )
      .default([]),
  }),

  breakdown: z.object({
    parMois: z
      .array(
        z.object({
          month: YearMonth,
          recettesHT: z.number(),
          depensesHT: z.number(),
          resultatNet: z.number(),
          tvaCollectee: z.number(),
          tvaDeductible: z.number(),
        })
      )
      .default([]),

    topRecettes: z
      .array(
        z.object({
          label: z.string(),
          amountHT: z.number(),
          count: z.number(),
        })
      )
      .default([]),

    topDepenses: z
      .array(
        z.object({
          label: z.string(),
          amountHT: z.number(),
          count: z.number(),
        })
      )
      .default([]),
  }),

  anomalies: z
    .array(
      z.object({
        severity: AnomalySeverity,
        message: z.string(),
        sheet: z
          .string()
          .optional()
          .nullable()
          .transform((v) => (v == null ? undefined : v)),
        rowIndex: z
          .number()
          .optional()
          .nullable()
          .transform((v) => (v == null ? undefined : v)),
      })
    )
    .default([]),

  data: z.object({
    sheets: z.record(
      z.string(),
      z.object({
        columns: z.array(z.string()),
        rows: z.array(z.array(z.unknown())),
        truncated: z.boolean().optional(),
      })
    ),
  }),

  summary: z.object({
    resume: z.string(),
    actions: z.array(z.string()).default([]),
    questions: z.array(z.string()).default([]),
  }),
});

export type ComptaReport = z.infer<typeof ComptaReportSchema>;