// apps/backend/src/services/externalIdMap.service.ts

import { supabaseAdmin } from "../lib/supabaseAdmin";
import { logger } from "../utils/logger";
import { HttpError } from "../utils/httpError";
import type { AccountingSource } from "./accountingMatching.service";

export type ExternalEntityType =
  | "invoice"
  | "payment"
  | "customer"
  | "supplier";

export type UpsertExternalMappingParams = {
  userId: string;
  sourceSystem: AccountingSource;
  externalEntityType: ExternalEntityType;
  externalId: string;
  internalId: string;
};

export class ExternalIdMapService {
  static async upsertExternalMapping(
    params: UpsertExternalMappingParams
  ): Promise<void> {
    const { sourceSystem, externalEntityType, externalId, internalId } = params;

    const normalizedExternalId = String(externalId ?? "").trim();
    const normalizedInternalId = String(internalId ?? "").trim();

    if (!normalizedExternalId) {
      throw new HttpError(400, "externalId is required");
    }

    if (!normalizedInternalId) {
      throw new HttpError(400, "internalId is required");
    }

    const now = new Date().toISOString();

    const { error } = await supabaseAdmin.from("external_id_map").upsert(
      {
        provider: sourceSystem,
        object_type: externalEntityType,
        external_id: normalizedExternalId,
        internal_id: normalizedInternalId,
        updated_at: now,
      },
      {
        onConflict: "provider,object_type,external_id",
      }
    );

    if (error) {
      logger.error("ExternalIdMapService.upsertExternalMapping failed", {
        userId: params.userId,
        sourceSystem,
        externalId,
        internalId,
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
      .eq("provider", params.sourceSystem)
      .eq("object_type", params.externalEntityType)
      .eq("external_id", params.externalId)
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
      .delete()
      .eq("provider", params.sourceSystem)
      .eq("object_type", params.externalEntityType)
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