// apps/backend/src/services/clients.service.ts
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { HttpError } from "../utils/httpError";
import { logger } from "../utils/logger";

export type ClientRow = {
  id: string;
  user_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  created_at: string;
  updated_at: string;
};

const CreateClientSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().nullable(),
  phone: z.string().min(1).optional().nullable(),
  address: z.string().min(1).optional().nullable(),
});

const UpdateClientSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional().nullable(),
  phone: z.string().min(1).optional().nullable(),
  address: z.string().min(1).optional().nullable(),
});

export class ClientsService {
  static async createClient(userId: string, input: unknown): Promise<ClientRow> {
    const parsed = CreateClientSchema.safeParse(input);
    if (!parsed.success) {
      throw new HttpError(400, "Invalid client payload");
    }

    const payload = parsed.data;

    const { data, error } = await supabaseAdmin
      .from("clients")
      .insert({
        user_id: userId,
        name: payload.name,
        email: payload.email ?? null,
        phone: payload.phone ?? null,
        address: payload.address ?? null,
      })
      .select("*")
      .single();

    if (error) {
      logger.error("ClientsService.createClient failed", {
        userId,
        message: error.message,
      });
      throw new HttpError(500, "Failed to create client");
    }

    return data as ClientRow;
  }

  static async listClients(userId: string): Promise<ClientRow[]> {
    const { data, error } = await supabaseAdmin
      .from("clients")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      logger.error("ClientsService.listClients failed", {
        userId,
        message: error.message,
      });
      throw new HttpError(500, "Failed to list clients");
    }

    return (data ?? []) as ClientRow[];
  }

  static async getClient(userId: string, clientId: string): Promise<ClientRow> {
    const { data, error } = await supabaseAdmin
      .from("clients")
      .select("*")
      .eq("id", clientId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      logger.error("ClientsService.getClient failed", {
        userId,
        clientId,
        message: error.message,
      });
      throw new HttpError(500, "Failed to load client");
    }

    if (!data) {
      throw new HttpError(404, "Client not found");
    }

    return data as ClientRow;
  }

  static async updateClient(
    userId: string,
    clientId: string,
    input: unknown
  ): Promise<ClientRow> {
    const parsed = UpdateClientSchema.safeParse(input);
    if (!parsed.success) {
      throw new HttpError(400, "Invalid client payload");
    }

    const patch = parsed.data;

    const { data, error } = await supabaseAdmin
      .from("clients")
      .update({
        ...patch,
        updated_at: new Date().toISOString(),
      })
      .eq("id", clientId)
      .eq("user_id", userId)
      .select("*")
      .single();

    if (error) {
      logger.error("ClientsService.updateClient failed", {
        userId,
        clientId,
        message: error.message,
      });
      throw new HttpError(500, "Failed to update client");
    }

    return data as ClientRow;
  }
}