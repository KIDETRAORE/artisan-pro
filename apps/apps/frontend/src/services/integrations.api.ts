// apps/frontend/src/services/integrations.api.ts
import { fetchWithAuth } from "../auth/fetchWithAuth";

export type PennylaneConnection = {
  provider: "pennylane";
  connected: boolean;
  status: string;
  connectedAt: string | null;
  hasCredential: boolean;
  usesWorkspaceKey: boolean;
};

export type PennylaneSyncEvent = {
  id: string;
  status: string;
  message: string | null;
  object_type: string | null;
  object_id: string | null;
  created_at: string;
};

export type PennylaneInvoiceSyncEvent = {
  id: string;
  status: "success" | "error";
  message: string | null;
  created_at: string;
};

type GetPennylaneStatusResponse = {
  success: boolean;
  provider: "pennylane";
  connection: PennylaneConnection;
  recentEvents: PennylaneSyncEvent[];
};

type ConnectPennylaneResponse = {
  success: boolean;
  provider: "pennylane";
  connection: PennylaneConnection;
};

type DisconnectPennylaneResponse = {
  success: boolean;
  provider: "pennylane";
};

type ResyncPennylaneInvoiceResponse = {
  success: boolean;
  provider: "pennylane";
  invoiceId: string;
  message: string;
};

type GetPennylaneInvoiceSyncEventsResponse = {
  success: boolean;
  events: PennylaneInvoiceSyncEvent[];
};

export async function getPennylaneStatus(limit = 10): Promise<{
  connection: PennylaneConnection;
  recentEvents: PennylaneSyncEvent[];
}> {
  const data = await fetchWithAuth<GetPennylaneStatusResponse>(
    `/integrations/pennylane/status?limit=${encodeURIComponent(String(limit))}`,
    {
      method: "GET",
    }
  );

  return {
    connection: data.connection,
    recentEvents: data.recentEvents ?? [],
  };
}

export async function connectPennylane(
  apiKey: string
): Promise<PennylaneConnection> {
  const data = await fetchWithAuth<ConnectPennylaneResponse>(
    "/integrations/pennylane/connect",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ apiKey }),
    }
  );

  return data.connection;
}

export async function disconnectPennylane(): Promise<void> {
  await fetchWithAuth<DisconnectPennylaneResponse>(
    "/integrations/pennylane/connect",
    {
      method: "DELETE",
    }
  );
}

export async function resyncPennylaneInvoice(
  invoiceId: string
): Promise<void> {
  await fetchWithAuth<ResyncPennylaneInvoiceResponse>(
    `/integrations/pennylane/invoices/${encodeURIComponent(invoiceId)}/resync`,
    {
      method: "POST",
    }
  );
}

export async function getPennylaneInvoiceSyncEvents(
  invoiceId: string
): Promise<PennylaneInvoiceSyncEvent[]> {
  const data = await fetchWithAuth<GetPennylaneInvoiceSyncEventsResponse>(
    `/integrations/pennylane/invoices/${encodeURIComponent(
      invoiceId
    )}/sync-events`,
    {
      method: "GET",
    }
  );

  return data.events ?? [];
}