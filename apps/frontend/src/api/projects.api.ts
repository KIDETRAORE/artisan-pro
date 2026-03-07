// apps/frontend/src/api/projects.api.ts
import { fetchWithAuth } from "../auth/fetchWithAuth";

export type Project = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  status: string;
  budget_cents: number | null;
  created_at: string;
  updated_at: string | null;
};

export type ProjectAlert = {
  code:
    | "no_revenue"
    | "budget_exceeded"
    | "budget_high_consumption"
    | "negative_margin"
    | "low_margin";
  level: "info" | "warning" | "critical";
  message: string;
};

export type ProjectExpenseCategory =
  | "materials"
  | "labor"
  | "equipment"
  | "transport"
  | "other";

export type ProjectExpensesByCategory = Record<ProjectExpenseCategory, number>;

export type ProjectAnalytics = {
  revenue_cents: number;
  paid_cents: number;
  expenses_cents: number;
  profit_cents: number;
  profitability_rate: number;
  budget_cents: number;
  remaining_budget_cents: number;
  budget_consumed_rate: number;
  health_status: "healthy" | "warning" | "critical";
  alerts: ProjectAlert[];
  expenses_by_category: ProjectExpensesByCategory;
  dominant_expense_category: ProjectExpenseCategory | null;
};

export type ProjectInsight = {
  title: string;
  risk_level: "low" | "medium" | "high";
  summary: {
    revenue_eur: number;
    expenses_eur: number;
    profit_eur: number;
    profitability_rate: number;
    budget_eur: number;
    remaining_budget_eur: number;
  };
  findings: string[];
  issues: string[];
  actions: string[];
  recommendation: string;
};

export type ProjectExpense = {
  id: string;
  user_id: string;
  project_id: string;
  description: string;
  amount_cents: number;
  category: ProjectExpenseCategory | null;
  expense_date: string | null;
  created_at: string;
};

export async function listProjects(): Promise<Project[]> {
  const data = await fetchWithAuth<{ success: boolean; projects: Project[] }>(
    "/projects",
    { method: "GET" }
  );

  return data.projects ?? [];
}

export async function createProject(payload: {
  name: string;
  description?: string | null;
  status?: string;
  budget_cents?: number | null;
}): Promise<Project> {
  const data = await fetchWithAuth<{ success: boolean; project: Project }>(
    "/projects",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  return data.project;
}

export async function getProject(projectId: string): Promise<Project> {
  const data = await fetchWithAuth<{ success: boolean; project: Project }>(
    `/projects/${projectId}`,
    { method: "GET" }
  );
  return data.project;
}

export async function getProjectAnalytics(
  projectId: string
): Promise<ProjectAnalytics> {
  const data = await fetchWithAuth<{
    success: boolean;
    analytics: ProjectAnalytics;
  }>(`/projects/${projectId}/analytics`, { method: "GET" });

  return {
    revenue_cents: data.analytics?.revenue_cents ?? 0,
    paid_cents: data.analytics?.paid_cents ?? 0,
    expenses_cents: data.analytics?.expenses_cents ?? 0,
    profit_cents: data.analytics?.profit_cents ?? 0,
    profitability_rate: data.analytics?.profitability_rate ?? 0,
    budget_cents: data.analytics?.budget_cents ?? 0,
    remaining_budget_cents: data.analytics?.remaining_budget_cents ?? 0,
    budget_consumed_rate: data.analytics?.budget_consumed_rate ?? 0,
    health_status: data.analytics?.health_status ?? "healthy",
    alerts: data.analytics?.alerts ?? [],
    expenses_by_category: data.analytics?.expenses_by_category ?? {
      materials: 0,
      labor: 0,
      equipment: 0,
      transport: 0,
      other: 0,
    },
    dominant_expense_category:
      data.analytics?.dominant_expense_category ?? null,
  };
}

export async function getProjectInsights(
  projectId: string
): Promise<ProjectInsight> {
  const data = await fetchWithAuth<{
    success: boolean;
    insight: ProjectInsight;
  }>(`/projects/${projectId}/insights`, { method: "GET" });

  return data.insight;
}

export async function listProjectExpenses(
  projectId: string
): Promise<ProjectExpense[]> {
  const data = await fetchWithAuth<{
    success: boolean;
    expenses: ProjectExpense[];
  }>(`/projects/${projectId}/expenses`, { method: "GET" });

  return data.expenses ?? [];
}

export async function createProjectExpense(
  projectId: string,
  payload: {
    label: string;
    amount_cents: number;
    vendor?: string | null;
    occurred_at?: string | null;
  }
): Promise<ProjectExpense> {
  const data = await fetchWithAuth<{
    success: boolean;
    expense: ProjectExpense;
  }>(`/projects/${projectId}/expenses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return data.expense;
}

export async function deleteProjectExpense(
  expenseId: string
): Promise<{ success: boolean }> {
  return await fetchWithAuth<{ success: boolean }>(
    `/project-expenses/${expenseId}`,
    {
      method: "DELETE",
    }
  );
}

// ✅ Import fichier comptable vers dépenses chantier
export async function importProjectAccountingFile(
  projectId: string,
  file: File
): Promise<{ success: boolean; imported: number }> {
  const formData = new FormData();
  formData.append("file", file);

  return await fetchWithAuth<{ success: boolean; imported: number }>(
    `/projects/${projectId}/import-accounting`,
    {
      method: "POST",
      body: formData,
    }
  );
}