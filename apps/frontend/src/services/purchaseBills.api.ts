// apps/frontend/src/services/purchaseBills.api.ts

import { fetchWithAuth } from "../auth/fetchWithAuth";

export type PurchaseBillStatus =
  | "draft"
  | "received"
  | "partial"
  | "paid"
  | "overdue"
  | "cancelled";

export type PurchaseBillSourceSystem =
  | "artisanpro"
  | "pennylane"
  | "odoo"
  | "file_import"
  | "manual";

export type PurchaseBillOriginType =
  | "manual"
  | "artisanpro"
  | "compta_import"
  | "sync";

export type PurchaseBill = {
  id: string;
  user_id: string;
  contact_id: string | null;
  project_id?: string | null;
  bill_number: string | null;
  issue_date?: string | null;
  due_date: string | null;
  total_amount_cents: number | null;
  currency: string | null;
  status: PurchaseBillStatus | string | null;
  source_system: PurchaseBillSourceSystem | string | null;
  source_external_id: string | null;
  origin_type: PurchaseBillOriginType | string | null;
  created_at?: string;
  updated_at?: string;
};

export type CreatePurchaseBillInput = {
  contact_id?: string | null;
  project_id?: string | null;
  bill_number?: string | null;
  issue_date?: string | null;
  due_date?: string | null;
  total_amount_cents?: number | null;
  currency?: string | null;
  status?: PurchaseBillStatus;
  source_system?: PurchaseBillSourceSystem | null;
  source_external_id?: string | null;
  origin_type?: PurchaseBillOriginType;
};

export type UpdatePurchaseBillInput = {
  contact_id?: string | null;
  project_id?: string | null;
  bill_number?: string | null;
  issue_date?: string | null;
  due_date?: string | null;
  total_amount_cents?: number | null;
  currency?: string | null;
  status?: PurchaseBillStatus;
  source_system?: PurchaseBillSourceSystem | null;
  source_external_id?: string | null;
  origin_type?: PurchaseBillOriginType;
};

type PurchaseBillsListResponse = {
  success: boolean;
  data: PurchaseBill[];
};

type PurchaseBillItemResponse = {
  success: boolean;
  data: PurchaseBill;
};

const API = {
  purchaseBills: "/purchase-bills",
  purchaseBillById: (id: string) =>
    `/purchase-bills/${encodeURIComponent(id)}`,
};

export async function listPurchaseBills(): Promise<PurchaseBill[]> {
  const data = await fetchWithAuth<PurchaseBillsListResponse>(
    API.purchaseBills,
    {
      method: "GET",
    }
  );

  if (data && Array.isArray(data.data)) {
    return data.data;
  }

  return [];
}

export async function getPurchaseBill(id: string): Promise<PurchaseBill> {
  const data = await fetchWithAuth<PurchaseBillItemResponse>(
    API.purchaseBillById(id),
    {
      method: "GET",
    }
  );

  return data.data;
}

export async function createPurchaseBill(
  input: CreatePurchaseBillInput
): Promise<PurchaseBill> {
  const data = await fetchWithAuth<PurchaseBillItemResponse>(
    API.purchaseBills,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  );

  return data.data;
}

export async function updatePurchaseBill(
  id: string,
  input: UpdatePurchaseBillInput
): Promise<PurchaseBill> {
  const data = await fetchWithAuth<PurchaseBillItemResponse>(
    API.purchaseBillById(id),
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  );

  return data.data;
}