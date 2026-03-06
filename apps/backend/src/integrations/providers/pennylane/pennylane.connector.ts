// apps/backend/src/integrations/providers/pennylane/pennylane.connector.ts
import { z } from "zod";
import { logger } from "../../../utils/logger";
import { HttpError } from "../../../utils/httpError";
import { ENV } from "../../../config/env";

/**
 * Pennylane Connector (MVP)
 *
 * ⚠️ Ici on ne fait PAS encore l'appel réel à l'API (tu n'as pas encore branché l'auth / tokens).
 * On met un squelette propre, avec :
 * - validation config
 * - fonction request() centralisée (ready pour rate-limit / retries)
 * - transform minimal facture -> payload Pennylane
 *
 * Prochaine étape : brancher l'auth (API key / OAuth) + appeler endpoints réels.
 */

export type PennylaneAuth =
  | { type: "api_key"; apiKey: string }
  | { type: "oauth"; accessToken: string };

const PennylaneConfigSchema = z.object({
  // MVP: on supporte API key via ENV.
  // Plus tard, on utilisera integration_tokens (OAuth) par user.
  apiKey: z.string().min(1).optional(),
  baseUrl: z.string().min(1).default("https://api.pennylane.com"),
});

function getConfig() {
  const parsed = PennylaneConfigSchema.safeParse({
    apiKey: ENV.PENNYLANE_API_KEY,
    baseUrl: ENV.PENNYLANE_BASE_URL || "https://api.pennylane.com",
  });

  if (!parsed.success) {
    logger.error("PennylaneConnector invalid config", {
      issues: parsed.error.issues,
    });
    throw new HttpError(500, "Pennylane connector misconfigured");
  }

  return parsed.data;
}

function getAuth(): PennylaneAuth {
  const { apiKey } = getConfig();

  // MVP : API key uniquement
  if (apiKey && apiKey.trim().length > 0) {
    return { type: "api_key", apiKey };
  }

  // OAuth viendra plus tard (integration_tokens)
  throw new HttpError(400, "Pennylane is not connected (missing credentials)");
}

type PennylaneRequestOpts = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
};

async function requestJson<T>(opts: PennylaneRequestOpts): Promise<T> {
  const cfg = getConfig();
  const auth = getAuth();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (auth.type === "api_key") {
    headers.Authorization = `Bearer ${auth.apiKey}`;
  } else {
    headers.Authorization = `Bearer ${auth.accessToken}`;
  }

  const url = `${cfg.baseUrl}${opts.path}`;

  const res = await fetch(url, {
    method: opts.method,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  // Gestion erreurs standardisées
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const meta = {
      status: res.status,
      method: opts.method,
      path: opts.path,
      response: text?.slice(0, 500),
    };

    // 401/403 => credentials
    if (res.status === 401 || res.status === 403) {
      logger.warn("Pennylane request unauthorized/forbidden", meta);
      throw new HttpError(401, "Pennylane unauthorized");
    }

    // 429 => rate limit
    if (res.status === 429) {
      logger.warn("Pennylane request rate-limited", meta);
      throw new HttpError(429, "Pennylane rate limit");
    }

    // autres
    logger.error("Pennylane request failed", meta);
    throw new HttpError(502, "Pennylane API error");
  }

  // Certaines APIs peuvent renvoyer 204
  if (res.status === 204) {
    return undefined as T;
  }

  const json = (await res.json().catch(() => null)) as T | null;
  if (!json) {
    throw new HttpError(502, "Invalid Pennylane response");
  }

  return json;
}

/**
 * ====== Transforms (MVP minimal) ======
 *
 * IMPORTANT: Le modèle exact Pennylane sera affiné quand on branchera
 * les endpoints réels + ton mapping lignes/taxes.
 */

export type ArtisanProInvoiceLine = {
  id: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
  tax_rate: number;
  line_total_cents: number;
};

export type ArtisanProInvoice = {
  id: string;
  client_name: string;
  client_email: string | null;
  total_amount: number;
  due_date: string;
  status: string;

  // ✅ AJOUT: lignes (pour sync correcte)
  lines: ArtisanProInvoiceLine[];
};

function centsToEuros(cents: number): number {
  return Math.round(cents) / 100;
}

function transformInvoice(invoice: ArtisanProInvoice) {
  // ✅ Payload enrichi avec lignes (toujours MVP)
  return {
    external_id: invoice.id,
    customer: {
      name: invoice.client_name,
      email: invoice.client_email ?? undefined,
    },
    due_date: invoice.due_date,
    status: invoice.status,
    origin: "artisanpro",

    // On conserve le total pour compat, mais la source de vérité devient lines
    total_amount: invoice.total_amount,

    line_items: invoice.lines.map((l) => ({
      external_id: l.id,
      description: l.description,
      quantity: l.quantity,
      unit_price: centsToEuros(l.unit_price_cents),
      tax_rate: l.tax_rate,
      line_total: centsToEuros(l.line_total_cents),
    })),
  };
}

/**
 * ====== Public API (Connector) ======
 */
export class PennylaneConnector {
  static async pushInvoice(invoice: ArtisanProInvoice): Promise<{ externalId: string }> {
    const payload = transformInvoice(invoice);

    logger.info("PennylaneConnector.pushInvoice ready", {
      invoiceId: invoice.id,
      linesCount: invoice.lines.length,
    });

    if (!ENV.PENNYLANE_SYNC_ENABLED) {
      return { externalId: `pennylane_stub_${invoice.id}` };
    }

    const created = await requestJson<{ id: string }>({
      method: "POST",
      path: "/api/external/v1/customer_invoices",
      body: payload,
    });

    return { externalId: created.id };
  }

  // ✅ UPDATE (si déjà sync => update au lieu de skip)
  static async updateInvoice(
    externalId: string,
    invoice: ArtisanProInvoice
  ): Promise<{ externalId: string }> {
    const payload = transformInvoice(invoice);

    logger.info("PennylaneConnector.updateInvoice ready", {
      invoiceId: invoice.id,
      externalId,
      linesCount: invoice.lines.length,
    });

    if (!ENV.PENNYLANE_SYNC_ENABLED) {
      return { externalId };
    }

    await requestJson<unknown>({
      method: "PATCH",
      path: `/api/external/v1/customer_invoices/${encodeURIComponent(externalId)}`,
      body: payload,
    });

    return { externalId };
  }
}