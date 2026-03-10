// apps/backend/src/services/integrations.service.ts
import { ENV } from "../config/env";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { HttpError } from "../utils/httpError";
import { logger } from "../utils/logger";
import { AccountingConnectorFactory } from "./accountingConnector.factory";

const PENNYLANE_PROVIDER = "pennylane" as const;
const ODOO_PROVIDER = "odoo" as const;

export type PennylaneConnectionStatus = {
  provider: typeof PENNYLANE_PROVIDER;
  connected: boolean;
  status: string;
  connectedAt: string | null;
  hasCredential: boolean;
  usesWorkspaceKey: boolean;
};

export type OdooConnectionStatus = {
  provider: typeof ODOO_PROVIDER;
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

type SupportedProvider = typeof PENNYLANE_PROVIDER | typeof ODOO_PROVIDER;

type OdooCredential = {
  baseUrl: string;
  database: string;
  login: string;
  apiKey: string;
};

function hasWorkspacePennylaneKey(): boolean {
  return (
    typeof ENV.PENNYLANE_API_KEY === "string" &&
    ENV.PENNYLANE_API_KEY.trim().length > 0
  );
}

function getWorkspacePennylaneKey(): string | null {
  const apiKey =
    typeof ENV.PENNYLANE_API_KEY === "string"
      ? ENV.PENNYLANE_API_KEY.trim()
      : "";

  return apiKey.length > 0 ? apiKey : null;
}

function hasWorkspaceOdooConfig(): boolean {
  return (
    typeof ENV.ODOO_API_KEY === "string" &&
    ENV.ODOO_API_KEY.trim().length > 0 &&
    typeof ENV.ODOO_BASE_URL === "string" &&
    ENV.ODOO_BASE_URL.trim().length > 0 &&
    typeof ENV.ODOO_DATABASE === "string" &&
    ENV.ODOO_DATABASE.trim().length > 0 &&
    typeof ENV.ODOO_LOGIN === "string" &&
    ENV.ODOO_LOGIN.trim().length > 0
  );
}

function getWorkspaceOdooConfig(): OdooCredential | null {
  const apiKey =
    typeof ENV.ODOO_API_KEY === "string" ? ENV.ODOO_API_KEY.trim() : "";
  const baseUrl =
    typeof ENV.ODOO_BASE_URL === "string" ? ENV.ODOO_BASE_URL.trim() : "";
  const database =
    typeof ENV.ODOO_DATABASE === "string" ? ENV.ODOO_DATABASE.trim() : "";
  const login = typeof ENV.ODOO_LOGIN === "string" ? ENV.ODOO_LOGIN.trim() : "";

  if (!apiKey || !baseUrl || !database || !login) {
    return null;
  }

  return {
    apiKey,
    baseUrl,
    database,
    login,
  };
}

async function testOdooCredential(
  credential: OdooCredential
): Promise<boolean> {
  try {
    const connector = AccountingConnectorFactory.create({
      provider: "odoo",
      config: {
        baseUrl: credential.baseUrl,
        database: credential.database,
        login: credential.login,
        apiKey: credential.apiKey,
      },
    });

    await connector.listInvoices(undefined);
    return true;
  } catch (error) {
    logger.warn("IntegrationsService.testOdooCredential failed", {
      baseUrl: credential.baseUrl,
      database: credential.database,
      login: credential.login,
      message: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

async function getIntegrationRow(userId: string, provider: SupportedProvider) {
  const { data, error } = await supabaseAdmin
    .from("integrations")
    .select("id, status, created_at")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();

  return { data, error };
}

async function getIntegrationToken(integrationId: string) {
  const { data, error } = await supabaseAdmin
    .from("integration_tokens")
    .select("access_token")
    .eq("integration_id", integrationId)
    .maybeSingle();

  return { data, error };
}

async function getSyncEvents(
  userId: string,
  provider: SupportedProvider,
  limit: number
) {
  const { data, error } = await supabaseAdmin
    .from("sync_events")
    .select("id, status, message, object_type, object_id, created_at")
    .eq("user_id", userId)
    .eq("provider", provider)
    .order("created_at", { ascending: false })
    .limit(limit);

  return { data, error };
}

async function upsertIntegration(params: {
  userId: string;
  provider: SupportedProvider;
}) {
  const { data, error } = await supabaseAdmin
    .from("integrations")
    .upsert(
      {
        user_id: params.userId,
        provider: params.provider,
        status: "connected",
      },
      { onConflict: "user_id,provider" }
    )
    .select("id, status, created_at")
    .single();

  return { data, error };
}

async function upsertIntegrationToken(params: {
  integrationId: string;
  accessToken: string;
}) {
  const now = new Date().toISOString();

  return await supabaseAdmin.from("integration_tokens").upsert(
    {
      integration_id: params.integrationId,
      access_token: params.accessToken,
      updated_at: now,
    },
    { onConflict: "integration_id" }
  );
}

async function upsertIntegrationSyncState(integrationId: string) {
  const now = new Date().toISOString();

  return await supabaseAdmin.from("integration_sync_state").upsert(
    {
      integration_id: integrationId,
      updated_at: now,
    },
    { onConflict: "integration_id" }
  );
}

async function deleteIntegration(userId: string, provider: SupportedProvider) {
  const { data: integration, error } = await supabaseAdmin
    .from("integrations")
    .select("id")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();

  if (error) {
    return { integration: null, error };
  }

  if (!integration) {
    return { integration: null, error: null };
  }

  const { error: deleteError } = await supabaseAdmin
    .from("integrations")
    .delete()
    .eq("id", integration.id)
    .eq("user_id", userId);

  return { integration, error: deleteError };
}

async function getIntegrationId(userId: string, provider: SupportedProvider) {
  const { data, error } = await supabaseAdmin
    .from("integrations")
    .select("id")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();

  return { data, error };
}

async function getIntegrationSyncState(integrationId: string) {
  const { data, error } = await supabaseAdmin
    .from("integration_sync_state")
    .select("error_count, cursor")
    .eq("integration_id", integrationId)
    .maybeSingle();

  return { data, error };
}

async function getLastCursor(
  userId: string,
  provider: SupportedProvider
): Promise<string | null> {
  const { data: integration, error } = await getIntegrationId(userId, provider);

  if (error) {
    logger.warn("IntegrationsService.getLastCursor integration lookup failed", {
      userId,
      provider,
      message: error.message,
    });
    return null;
  }

  if (!integration?.id) {
    return null;
  }

  const { data: syncState, error: syncStateError } =
    await getIntegrationSyncState(integration.id);

  if (syncStateError) {
    logger.warn("IntegrationsService.getLastCursor sync state lookup failed", {
      userId,
      provider,
      integrationId: integration.id,
      message: syncStateError.message,
    });
    return null;
  }

  const lastCursor =
    typeof (syncState as any)?.cursor === "string"
      ? (syncState as any).cursor.trim()
      : "";

  return lastCursor.length > 0 ? lastCursor : null;
}

async function markSyncSuccessInternal(params: {
  userId: string;
  provider: SupportedProvider;
  lastCursor?: string | null;
}): Promise<void> {
  const { data: integration, error } = await getIntegrationId(
    params.userId,
    params.provider
  );

  if (error || !integration) {
    if (error) {
      logger.warn("IntegrationsService.markSyncSuccessInternal lookup failed", {
        userId: params.userId,
        provider: params.provider,
        message: error.message,
      });
    }
    return;
  }

  const now = new Date().toISOString();
  const cursor =
    typeof params.lastCursor === "string" ? params.lastCursor.trim() : "";

  const payload: Record<string, unknown> = {
    integration_id: integration.id,
    last_sync_at: now,
    last_success_at: now,
    error_count: 0,
    last_error: null,
    updated_at: now,
  };

  if (cursor.length > 0) {
    payload.cursor = cursor;
  }

  const { error: upsertError } = await supabaseAdmin
    .from("integration_sync_state")
    .upsert(payload, { onConflict: "integration_id" });

  if (upsertError) {
    logger.warn("IntegrationsService.markSyncSuccessInternal upsert failed", {
      userId: params.userId,
      provider: params.provider,
      integrationId: integration.id,
      message: upsertError.message,
    });
  }
}

async function markSyncErrorInternal(params: {
  userId: string;
  provider: SupportedProvider;
  errorMessage: string;
}): Promise<void> {
  const { data: integration, error } = await getIntegrationId(
    params.userId,
    params.provider
  );

  if (error || !integration) {
    if (error) {
      logger.warn("IntegrationsService.markSyncErrorInternal lookup failed", {
        userId: params.userId,
        provider: params.provider,
        message: error.message,
      });
    }
    return;
  }

  const { data: currentState, error: currentStateError } =
    await getIntegrationSyncState(integration.id);

  if (currentStateError) {
    logger.warn(
      "IntegrationsService.markSyncErrorInternal current state lookup failed",
      {
        userId: params.userId,
        provider: params.provider,
        integrationId: integration.id,
        message: currentStateError.message,
      }
    );
  }

  const previousErrorCount =
    Number((currentState as any)?.error_count ?? 0) || 0;
  const now = new Date().toISOString();

  const { error: upsertError } = await supabaseAdmin
    .from("integration_sync_state")
    .upsert(
      {
        integration_id: integration.id,
        last_sync_at: now,
        error_count: previousErrorCount + 1,
        last_error: params.errorMessage,
        updated_at: now,
      },
      { onConflict: "integration_id" }
    );

  if (upsertError) {
    logger.warn("IntegrationsService.markSyncErrorInternal upsert failed", {
      userId: params.userId,
      provider: params.provider,
      integrationId: integration.id,
      message: upsertError.message,
    });
  }
}

export class IntegrationsService {
  static async getPennylaneStatus(
    userId: string
  ): Promise<PennylaneConnectionStatus> {
    const { data: integration, error } = await getIntegrationRow(
      userId,
      PENNYLANE_PROVIDER
    );

    if (error) {
      logger.error(
        "IntegrationsService.getPennylaneStatus integration lookup failed",
        {
          userId,
          message: error.message,
        }
      );
      throw new HttpError(500, "Failed to load Pennylane status");
    }

    const usesWorkspaceKey = hasWorkspacePennylaneKey();

    if (!integration) {
      return {
        provider: PENNYLANE_PROVIDER,
        connected: usesWorkspaceKey,
        status: usesWorkspaceKey ? "workspace" : "disconnected",
        connectedAt: null,
        hasCredential: usesWorkspaceKey,
        usesWorkspaceKey,
      };
    }

    const { data: token, error: tokenError } = await getIntegrationToken(
      integration.id
    );

    if (tokenError) {
      logger.error(
        "IntegrationsService.getPennylaneStatus token lookup failed",
        {
          userId,
          integrationId: integration.id,
          message: tokenError.message,
        }
      );
      throw new HttpError(500, "Failed to load Pennylane credential");
    }

    const hasCredential =
      typeof token?.access_token === "string" &&
      token.access_token.trim().length > 0;

    return {
      provider: PENNYLANE_PROVIDER,
      connected: hasCredential || usesWorkspaceKey,
      status: String(
        integration.status ?? (hasCredential ? "connected" : "pending")
      ),
      connectedAt: integration.created_at ?? null,
      hasCredential,
      usesWorkspaceKey,
    };
  }

  static async getPennylaneSyncEvents(
    userId: string,
    limit = 10
  ): Promise<PennylaneSyncEvent[]> {
    const { data, error } = await getSyncEvents(
      userId,
      PENNYLANE_PROVIDER,
      limit
    );

    if (error) {
      logger.error("IntegrationsService.getPennylaneSyncEvents failed", {
        userId,
        message: error.message,
      });
      throw new HttpError(500, "Failed to load Pennylane sync events");
    }

    return (data ?? []) as PennylaneSyncEvent[];
  }

  static async connectPennylane(
    userId: string,
    apiKey: string
  ): Promise<PennylaneConnectionStatus> {
    const trimmedApiKey = apiKey.trim();

    if (!trimmedApiKey) {
      throw new HttpError(400, "Pennylane API key is required");
    }

    const { data: integration, error } = await upsertIntegration({
      userId,
      provider: PENNYLANE_PROVIDER,
    });

    if (error || !integration) {
      logger.error(
        "IntegrationsService.connectPennylane integration upsert failed",
        {
          userId,
          message: error?.message,
        }
      );
      throw new HttpError(500, "Failed to connect Pennylane");
    }

    const { error: tokenError } = await upsertIntegrationToken({
      integrationId: integration.id,
      accessToken: trimmedApiKey,
    });

    if (tokenError) {
      logger.error(
        "IntegrationsService.connectPennylane token upsert failed",
        {
          userId,
          integrationId: integration.id,
          message: tokenError.message,
        }
      );
      throw new HttpError(500, "Failed to store Pennylane credential");
    }

    const { error: syncStateError } = await upsertIntegrationSyncState(
      integration.id
    );

    if (syncStateError) {
      logger.warn(
        "IntegrationsService.connectPennylane sync_state upsert failed",
        {
          userId,
          integrationId: integration.id,
          message: syncStateError.message,
        }
      );
    }

    return await this.getPennylaneStatus(userId);
  }

  static async disconnectPennylane(userId: string): Promise<void> {
    const { integration, error } = await deleteIntegration(
      userId,
      PENNYLANE_PROVIDER
    );

    if (error) {
      logger.error("IntegrationsService.disconnectPennylane delete failed", {
        userId,
        integrationId: integration?.id,
        message: error.message,
      });
      throw new HttpError(500, "Failed to disconnect Pennylane");
    }
  }

  static async getPennylaneApiKey(userId: string): Promise<string | null> {
    const workspaceKey = getWorkspacePennylaneKey();

    const { data: integration, error } = await supabaseAdmin
      .from("integrations")
      .select("id, status")
      .eq("user_id", userId)
      .eq("provider", PENNYLANE_PROVIDER)
      .maybeSingle();

    if (error) {
      logger.warn(
        "IntegrationsService.getPennylaneApiKey integration lookup failed",
        {
          userId,
          message: error.message,
        }
      );
      return workspaceKey;
    }

    if (!integration) {
      return workspaceKey;
    }

    if (String(integration.status ?? "") !== "connected") {
      return workspaceKey;
    }

    const { data: token, error: tokenError } = await getIntegrationToken(
      integration.id
    );

    if (tokenError) {
      logger.warn(
        "IntegrationsService.getPennylaneApiKey token lookup failed",
        {
          userId,
          integrationId: integration.id,
          message: tokenError.message,
        }
      );
      return workspaceKey;
    }

    const apiKey =
      typeof token?.access_token === "string"
        ? token.access_token.trim()
        : "";

    return apiKey.length > 0 ? apiKey : workspaceKey;
  }

  static async getPennylaneLastCursor(userId: string): Promise<string | null> {
    return await getLastCursor(userId, PENNYLANE_PROVIDER);
  }

  static async markPennylaneSyncSuccess(
    userId: string,
    lastCursor?: string | null
  ): Promise<void> {
    await markSyncSuccessInternal({
      userId,
      provider: PENNYLANE_PROVIDER,
      lastCursor,
    });
  }

  static async markPennylaneSyncError(
    userId: string,
    errorMessage: string
  ): Promise<void> {
    await markSyncErrorInternal({
      userId,
      provider: PENNYLANE_PROVIDER,
      errorMessage,
    });
  }

  static async getOdooStatus(userId: string): Promise<OdooConnectionStatus> {
    const { data: integration, error } = await getIntegrationRow(
      userId,
      ODOO_PROVIDER
    );

    if (error) {
      logger.error("IntegrationsService.getOdooStatus integration lookup failed", {
        userId,
        message: error.message,
      });
      throw new HttpError(500, "Failed to load Odoo status");
    }

    const usesWorkspaceKey = hasWorkspaceOdooConfig();

    if (!integration) {
      const workspaceCredential = getWorkspaceOdooConfig();
      const workspaceConnected = workspaceCredential
        ? await testOdooCredential(workspaceCredential)
        : false;

      return {
        provider: ODOO_PROVIDER,
        connected: workspaceConnected,
        status: usesWorkspaceKey
          ? workspaceConnected
            ? "workspace"
            : "invalid_workspace"
          : "disconnected",
        connectedAt: null,
        hasCredential: usesWorkspaceKey,
        usesWorkspaceKey,
      };
    }

    const { data: token, error: tokenError } = await getIntegrationToken(
      integration.id
    );

    if (tokenError) {
      logger.error("IntegrationsService.getOdooStatus token lookup failed", {
        userId,
        integrationId: integration.id,
        message: tokenError.message,
      });
      throw new HttpError(500, "Failed to load Odoo credential");
    }

    let storedCredential: OdooCredential | null = null;

    if (typeof token?.access_token === "string") {
      try {
        const parsed = JSON.parse(token.access_token) as Partial<OdooCredential>;
        const baseUrl =
          typeof parsed.baseUrl === "string" ? parsed.baseUrl.trim() : "";
        const database =
          typeof parsed.database === "string" ? parsed.database.trim() : "";
        const login =
          typeof parsed.login === "string" ? parsed.login.trim() : "";
        const apiKey =
          typeof parsed.apiKey === "string" ? parsed.apiKey.trim() : "";

        if (baseUrl && database && login && apiKey) {
          storedCredential = {
            baseUrl,
            database,
            login,
            apiKey,
          };
        }
      } catch {
        storedCredential = null;
      }
    }

    const credentialToTest = storedCredential ?? getWorkspaceOdooConfig();
    const hasCredential = Boolean(storedCredential || usesWorkspaceKey);
    const connected = credentialToTest
      ? await testOdooCredential(credentialToTest)
      : false;

    return {
      provider: ODOO_PROVIDER,
      connected,
      status: connected
        ? String(
            integration.status ??
              (storedCredential
                ? "connected"
                : usesWorkspaceKey
                  ? "workspace"
                  : "pending")
          )
        : "invalid_credentials",
      connectedAt: integration.created_at ?? null,
      hasCredential,
      usesWorkspaceKey,
    };
  }

  static async getOdooSyncEvents(
    userId: string,
    limit = 10
  ): Promise<OdooSyncEvent[]> {
    const { data, error } = await getSyncEvents(userId, ODOO_PROVIDER, limit);

    if (error) {
      logger.error("IntegrationsService.getOdooSyncEvents failed", {
        userId,
        message: error.message,
      });
      throw new HttpError(500, "Failed to load Odoo sync events");
    }

    return (data ?? []) as OdooSyncEvent[];
  }

  static async connectOdoo(
    userId: string,
    credential: OdooCredential
  ): Promise<OdooConnectionStatus> {
    const baseUrl = credential.baseUrl.trim();
    const database = credential.database.trim();
    const login = credential.login.trim();
    const apiKey = credential.apiKey.trim();

    if (!baseUrl || !database || !login || !apiKey) {
      throw new HttpError(400, "Odoo credentials are required");
    }

    const isValid = await testOdooCredential({
      baseUrl,
      database,
      login,
      apiKey,
    });

    if (!isValid) {
      throw new HttpError(400, "Invalid Odoo credentials");
    }

    const { data: integration, error } = await upsertIntegration({
      userId,
      provider: ODOO_PROVIDER,
    });

    if (error || !integration) {
      logger.error("IntegrationsService.connectOdoo integration upsert failed", {
        userId,
        message: error?.message,
      });
      throw new HttpError(500, "Failed to connect Odoo");
    }

    const serializedCredential = JSON.stringify({
      baseUrl,
      database,
      login,
      apiKey,
    });

    const { error: tokenError } = await upsertIntegrationToken({
      integrationId: integration.id,
      accessToken: serializedCredential,
    });

    if (tokenError) {
      logger.error("IntegrationsService.connectOdoo token upsert failed", {
        userId,
        integrationId: integration.id,
        message: tokenError.message,
      });
      throw new HttpError(500, "Failed to store Odoo credential");
    }

    const { error: syncStateError } = await upsertIntegrationSyncState(
      integration.id
    );

    if (syncStateError) {
      logger.warn("IntegrationsService.connectOdoo sync_state upsert failed", {
        userId,
        integrationId: integration.id,
        message: syncStateError.message,
      });
    }

    return await this.getOdooStatus(userId);
  }

  static async disconnectOdoo(userId: string): Promise<void> {
    const { integration, error } = await deleteIntegration(userId, ODOO_PROVIDER);

    if (error) {
      logger.error("IntegrationsService.disconnectOdoo delete failed", {
        userId,
        integrationId: integration?.id,
        message: error.message,
      });
      throw new HttpError(500, "Failed to disconnect Odoo");
    }
  }

  static async getOdooCredential(userId: string): Promise<OdooCredential | null> {
    const workspaceConfig = getWorkspaceOdooConfig();

    const { data: integration, error } = await supabaseAdmin
      .from("integrations")
      .select("id, status")
      .eq("user_id", userId)
      .eq("provider", ODOO_PROVIDER)
      .maybeSingle();

    if (error) {
      logger.warn(
        "IntegrationsService.getOdooCredential integration lookup failed",
        {
          userId,
          message: error.message,
        }
      );
      return workspaceConfig;
    }

    if (!integration) {
      return workspaceConfig;
    }

    if (String(integration.status ?? "") !== "connected") {
      return workspaceConfig;
    }

    const { data: token, error: tokenError } = await getIntegrationToken(
      integration.id
    );

    if (tokenError) {
      logger.warn("IntegrationsService.getOdooCredential token lookup failed", {
        userId,
        integrationId: integration.id,
        message: tokenError.message,
      });
      return workspaceConfig;
    }

    if (typeof token?.access_token !== "string") {
      return workspaceConfig;
    }

    try {
      const parsed = JSON.parse(token.access_token) as Partial<OdooCredential>;

      const baseUrl =
        typeof parsed.baseUrl === "string" ? parsed.baseUrl.trim() : "";
      const database =
        typeof parsed.database === "string" ? parsed.database.trim() : "";
      const login = typeof parsed.login === "string" ? parsed.login.trim() : "";
      const apiKey =
        typeof parsed.apiKey === "string" ? parsed.apiKey.trim() : "";

      if (!baseUrl || !database || !login || !apiKey) {
        return workspaceConfig;
      }

      return {
        baseUrl,
        database,
        login,
        apiKey,
      };
    } catch {
      return workspaceConfig;
    }
  }

  static async getOdooLastCursor(userId: string): Promise<string | null> {
    return await getLastCursor(userId, ODOO_PROVIDER);
  }

  static async markOdooSyncSuccess(
    userId: string,
    lastCursor?: string | null
  ): Promise<void> {
    await markSyncSuccessInternal({
      userId,
      provider: ODOO_PROVIDER,
      lastCursor,
    });
  }

  static async markOdooSyncError(
    userId: string,
    errorMessage: string
  ): Promise<void> {
    await markSyncErrorInternal({
      userId,
      provider: ODOO_PROVIDER,
      errorMessage,
    });
  }
}