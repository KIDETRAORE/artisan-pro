// apps/backend/src/services/externalIdMap.service.ts

import { supabaseAdmin } from "../lib/supabaseAdmin";
import { logger } from "../utils/logger";
import { HttpError } from "../utils/httpError";
import type { AccountingSource } from "./accountingMatching.service";

type ExternalEntityType = "invoice" | "payment";

type InternalEntityType = "invoice" | "payment";

type MatchConfidence = "exact" | "high" | "probable" | "manual";

export type UpsertExternalMappingParams = {
  userId: string;
  sourceSystem: AccountingSource;
  externalEntityType: ExternalEntityType;
  externalId: string;
  internalEntityType: InternalEntityType;
  internalId: string;
  matchConfidence: MatchConfidence;
};

export class ExternalIdMapService {
  static async upsertExternalMapping(
    params: UpsertExternalMappingParams
  ): Promise<void> {
    const {
      userId,
      sourceSystem,
      externalEntityType,
      externalId,
      internalEntityType,
      internalId,
      matchConfidence,
    } = params;

    const normalizedExternalId = String(externalId ?? "").trim();

    if (!normalizedExternalId) {
      throw new HttpError(400, "externalId is required");
    }

    const now = new Date().toISOString();

    const { error } = await supabaseAdmin
      .from("external_id_map")
      .upsert(
        {
          user_id: userId,
          source_system: sourceSystem,
          external_entity_type: externalEntityType,
          external_id: normalizedExternalId,
          internal_entity_type: internalEntityType,
          internal_id: internalId,
          match_confidence: matchConfidence,
          is_active: true,
          updated_at: now,
        },
        {
          onConflict:
            "user_id,source_system,external_entity_type,external_id",
        }
      );

    if (error) {
      logger.error("ExternalIdMapService.upsertExternalMapping failed", {
        userId,
        sourceSystem,
        externalId,
        message: error.message,
      });

      throw new HttpError(500, "Failed to upsert external id mapping");
    }
  }

  static async findInternalId(params: {
    userId: string;
    sourceSystem: AccountingSource;
    externalEntityType: ExternalEntityType;
    externalId: string;
  }): Promise<string | null> {
    const { data, error } = await supabaseAdmin
      .from("external_id_map")
      .select("internal_id")
      .eq("user_id", params.userId)
      .eq("source_system", params.sourceSystem)
      .eq("external_entity_type", params.externalEntityType)
      .eq("external_id", params.externalId)
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      logger.warn("ExternalIdMapService.findInternalId failed", {
        userId: params.userId,
        sourceSystem: params.sourceSystem,
        externalId: params.externalId,
        message: error.message,
      });

      return null;
    }

    return data?.internal_id ?? null;
  }

  static async deactivateMapping(params: {
    userId: string;
    sourceSystem: AccountingSource;
    externalEntityType: ExternalEntityType;
    externalId: string;
  }): Promise<void> {
    const { error } = await supabaseAdmin
      .from("external_id_map")
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", params.userId)
      .eq("source_system", params.sourceSystem)
      .eq("external_entity_type", params.externalEntityType)
      .eq("external_id", params.externalId);

    if (error) {
      logger.warn("ExternalIdMapService.deactivateMapping failed", {
        userId: params.userId,
        sourceSystem: params.sourceSystem,
        externalId: params.externalId,
        message: error.message,
      });
    }
  }
}