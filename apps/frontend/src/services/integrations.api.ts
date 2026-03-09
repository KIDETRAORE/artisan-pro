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

export type OdooConnection = {
  provider: "odoo";
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

export type OdooSyncEvent = {
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

export type OdooInvoiceSyncEvent = {
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

type GetOdooStatusResponse = {
  success: boolean;
  provider: "odoo";
  connection: OdooConnection;
  recentEvents: OdooSyncEvent[];
};

type ConnectPennylaneResponse = {
  success: boolean;
  provider: "pennylane";
  connection: PennylaneConnection;
};

type ConnectOdooResponse = {
  success: boolean;
  provider: "odoo";
  connection: OdooConnection;
};

type DisconnectPennylaneResponse = {
  success: boolean;
  provider: "pennylane";
};

type DisconnectOdooResponse = {
  success: boolean;
  provider: "odoo";
};

type SyncPennylaneResponse = {
  success: boolean;
  provider: "pennylane";
  message: string;
};

type SyncOdooResponse = {
  success: boolean;
  provider: "odoo";
  message: string;
};

type ResyncPennylaneInvoiceResponse = {
  success: boolean;
  provider: "pennylane";
  invoiceId: string;
  message: string;
};

type ResyncOdooInvoiceResponse = {
  success: boolean;
  provider: "odoo";
  invoiceId: string;
  message: string;
};

type GetPennylaneInvoiceSyncEventsResponse = {
  success: boolean;
  events: PennylaneInvoiceSyncEvent[];
};

type GetOdooInvoiceSyncEventsResponse = {
  success: boolean;
  events: OdooInvoiceSyncEvent[];
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

export async function getOdooStatus(limit = 10): Promise<{
  connection: OdooConnection;
  recentEvents: OdooSyncEvent[];
}> {
  const data = await fetchWithAuth<GetOdooStatusResponse>(
    `/integrations/odoo/status?limit=${encodeURIComponent(String(limit))}`,
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

export async function connectOdoo(payload: {
  baseUrl: string;
  database: string;
  login: string;
  apiKey: string;
}): Promise<OdooConnection> {
  const data = await fetchWithAuth<ConnectOdooResponse>(
    "/integrations/odoo/connect",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
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

export async function disconnectOdoo(): Promise<void> {
  await fetchWithAuth<DisconnectOdooResponse>("/integrations/odoo/connect", {
    method: "DELETE",
  });
}

export async function syncPennylane(): Promise<void> {
  await fetchWithAuth<SyncPennylaneResponse>("/integrations/pennylane/sync", {
    method: "POST",
  });
}

export async function syncOdoo(): Promise<void> {
  await fetchWithAuth<SyncOdooResponse>("/integrations/odoo/sync", {
    method: "POST",
  });
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

export async function resyncOdooInvoice(invoiceId: string): Promise<void> {
  await fetchWithAuth<ResyncOdooInvoiceResponse>(
    `/integrations/odoo/invoices/${encodeURIComponent(invoiceId)}/resync`,
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

export async function getOdooInvoiceSyncEvents(
  invoiceId: string
): Promise<OdooInvoiceSyncEvent[]> {
  const data = await fetchWithAuth<GetOdooInvoiceSyncEventsResponse>(
    `/integrations/odoo/invoices/${encodeURIComponent(invoiceId)}/sync-events`,
    {
      method: "GET",
    }
  );

  return data.events ?? [];
}