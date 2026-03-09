// apps/backend/src/services/integrations.service.ts
import { ENV } from "../config/env";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { HttpError } from "../utils/httpError";
import { logger } from "../utils/logger";

const PENNYLANE_PROVIDER = "pennylane" as const;

export type PennylaneConnectionStatus = {
  provider: typeof PENNYLANE_PROVIDER;
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

export class IntegrationsService {
  static async getPennylaneStatus(
    userId: string
  ): Promise<PennylaneConnectionStatus> {
    const { data: integration, error } = await supabaseAdmin
      .from("integrations")
      .select("id, status, created_at")
      .eq("user_id", userId)
      .eq("provider", PENNYLANE_PROVIDER)
      .maybeSingle();

    if (error) {
      logger.error("IntegrationsService.getPennylaneStatus integration lookup failed", {
        userId,
        message: error.message,
      });
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

    const { data: token, error: tokenError } = await supabaseAdmin
      .from("integration_tokens")
      .select("access_token")
      .eq("integration_id", integration.id)
      .maybeSingle();

    if (tokenError) {
      logger.error("IntegrationsService.getPennylaneStatus token lookup failed", {
        userId,
        integrationId: integration.id,
        message: tokenError.message,
      });
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
    const { data, error } = await supabaseAdmin
      .from("sync_events")
      .select("id, status, message, object_type, object_id, created_at")
      .eq("user_id", userId)
      .eq("provider", PENNYLANE_PROVIDER)
      .order("created_at", { ascending: false })
      .limit(limit);

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

    const { data: integration, error } = await supabaseAdmin
      .from("integrations")
      .upsert(
        {
          user_id: userId,
          provider: PENNYLANE_PROVIDER,
          status: "connected",
        },
        { onConflict: "user_id,provider" }
      )
      .select("id, status, created_at")
      .single();

    if (error || !integration) {
      logger.error("IntegrationsService.connectPennylane integration upsert failed", {
        userId,
        message: error?.message,
      });
      throw new HttpError(500, "Failed to connect Pennylane");
    }

    const now = new Date().toISOString();

    const { error: tokenError } = await supabaseAdmin
      .from("integration_tokens")
      .upsert(
        {
          integration_id: integration.id,
          access_token: trimmedApiKey,
          updated_at: now,
        },
        { onConflict: "integration_id" }
      );

    if (tokenError) {
      logger.error("IntegrationsService.connectPennylane token upsert failed", {
        userId,
        integrationId: integration.id,
        message: tokenError.message,
      });
      throw new HttpError(500, "Failed to store Pennylane credential");
    }

    const { error: syncStateError } = await supabaseAdmin
      .from("integration_sync_state")
      .upsert(
        {
          integration_id: integration.id,
          updated_at: now,
        },
        { onConflict: "integration_id" }
      );

    if (syncStateError) {
      logger.warn("IntegrationsService.connectPennylane sync_state upsert failed", {
        userId,
        integrationId: integration.id,
        message: syncStateError.message,
      });
    }

    return await this.getPennylaneStatus(userId);
  }

  static async disconnectPennylane(userId: string): Promise<void> {
    const { data: integration, error } = await supabaseAdmin
      .from("integrations")
      .select("id")
      .eq("user_id", userId)
      .eq("provider", PENNYLANE_PROVIDER)
      .maybeSingle();

    if (error) {
      logger.error("IntegrationsService.disconnectPennylane lookup failed", {
        userId,
        message: error.message,
      });
      throw new HttpError(500, "Failed to disconnect Pennylane");
    }

    if (!integration) {
      return;
    }

    const { error: deleteError } = await supabaseAdmin
      .from("integrations")
      .delete()
      .eq("id", integration.id)
      .eq("user_id", userId);

    if (deleteError) {
      logger.error("IntegrationsService.disconnectPennylane delete failed", {
        userId,
        integrationId: integration.id,
        message: deleteError.message,
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
      logger.warn("IntegrationsService.getPennylaneApiKey integration lookup failed", {
        userId,
        message: error.message,
      });
      return workspaceKey;
    }

    if (!integration) {
      return workspaceKey;
    }

    if (String(integration.status ?? "") !== "connected") {
      return workspaceKey;
    }

    const { data: token, error: tokenError } = await supabaseAdmin
      .from("integration_tokens")
      .select("access_token")
      .eq("integration_id", integration.id)
      .maybeSingle();

    if (tokenError) {
      logger.warn("IntegrationsService.getPennylaneApiKey token lookup failed", {
        userId,
        integrationId: integration.id,
        message: tokenError.message,
      });
      return workspaceKey;
    }

    const apiKey =
      typeof token?.access_token === "string"
        ? token.access_token.trim()
        : "";

    return apiKey.length > 0 ? apiKey : workspaceKey;
  }

  static async markPennylaneSyncSuccess(userId: string): Promise<void> {
    const { data: integration, error } = await supabaseAdmin
      .from("integrations")
      .select("id")
      .eq("user_id", userId)
      .eq("provider", PENNYLANE_PROVIDER)
      .maybeSingle();

    if (error || !integration) {
      if (error) {
        logger.warn("IntegrationsService.markPennylaneSyncSuccess lookup failed", {
          userId,
          message: error.message,
        });
      }
      return;
    }

    const now = new Date().toISOString();

    const { error: upsertError } = await supabaseAdmin
      .from("integration_sync_state")
      .upsert(
        {
          integration_id: integration.id,
          last_sync_at: now,
          last_success_at: now,
          error_count: 0,
          last_error: null,
          updated_at: now,
        },
        { onConflict: "integration_id" }
      );

    if (upsertError) {
      logger.warn("IntegrationsService.markPennylaneSyncSuccess upsert failed", {
        userId,
        integrationId: integration.id,
        message: upsertError.message,
      });
    }
  }

  static async markPennylaneSyncError(
    userId: string,
    errorMessage: string
  ): Promise<void> {
    const { data: integration, error } = await supabaseAdmin
      .from("integrations")
      .select("id")
      .eq("user_id", userId)
      .eq("provider", PENNYLANE_PROVIDER)
      .maybeSingle();

    if (error || !integration) {
      if (error) {
        logger.warn("IntegrationsService.markPennylaneSyncError lookup failed", {
          userId,
          message: error.message,
        });
      }
      return;
    }

    const { data: currentState, error: currentStateError } = await supabaseAdmin
      .from("integration_sync_state")
      .select("error_count")
      .eq("integration_id", integration.id)
      .maybeSingle();

    if (currentStateError) {
      logger.warn("IntegrationsService.markPennylaneSyncError current state lookup failed", {
        userId,
        integrationId: integration.id,
        message: currentStateError.message,
      });
    }

    const previousErrorCount = Number((currentState as any)?.error_count ?? 0) || 0;
    const now = new Date().toISOString();

    const { error: upsertError } = await supabaseAdmin
      .from("integration_sync_state")
      .upsert(
        {
          integration_id: integration.id,
          last_sync_at: now,
          error_count: previousErrorCount + 1,
          last_error: errorMessage,
          updated_at: now,
        },
        { onConflict: "integration_id" }
      );

    if (upsertError) {
      logger.warn("IntegrationsService.markPennylaneSyncError upsert failed", {
        userId,
        integrationId: integration.id,
        message: upsertError.message,
      });
    }
  }
}