// apps/backend/src/services/contacts.service.ts
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { HttpError } from "../utils/httpError";
import { logger } from "../utils/logger";
import {
  ExternalIdMapService,
  type ExternalEntityType,
} from "./externalIdMap.service";
import { type AccountingSource } from "./accountingMatching.service";

export type ContactType = "client" | "supplier" | "both";

export type ContactRow = {
  id: string;
  user_id: string;
  name: string;
  contact_type: ContactType | string;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  vat_number: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  source_system: string | null;
  source_external_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const ContactTypeSchema = z.enum(["client", "supplier", "both"]);

const CreateContactSchema = z.object({
  name: z.string().min(1),
  contact_type: ContactTypeSchema.default("client"),
  email: z.string().email().optional().nullable(),
  phone: z.string().min(1).optional().nullable(),
  company_name: z.string().min(1).optional().nullable(),
  vat_number: z.string().min(1).optional().nullable(),
  address_line1: z.string().min(1).optional().nullable(),
  address_line2: z.string().min(1).optional().nullable(),
  postal_code: z.string().min(1).optional().nullable(),
  city: z.string().min(1).optional().nullable(),
  country: z.string().min(1).optional().nullable(),
  source_system: z.string().min(1).optional().nullable(),
  source_external_id: z.string().min(1).optional().nullable(),
  notes: z.string().optional().nullable(),
});

const UpdateContactSchema = z.object({
  name: z.string().min(1).optional(),
  contact_type: ContactTypeSchema.optional(),
  email: z.string().email().optional().nullable(),
  phone: z.string().min(1).optional().nullable(),
  company_name: z.string().min(1).optional().nullable(),
  vat_number: z.string().min(1).optional().nullable(),
  address_line1: z.string().min(1).optional().nullable(),
  address_line2: z.string().min(1).optional().nullable(),
  postal_code: z.string().min(1).optional().nullable(),
  city: z.string().min(1).optional().nullable(),
  country: z.string().min(1).optional().nullable(),
  source_system: z.string().min(1).optional().nullable(),
  source_external_id: z.string().min(1).optional().nullable(),
  notes: z.string().optional().nullable(),
});

const FindOrCreateContactSchema = z.object({
  name: z.string().min(1),
  contact_type: ContactTypeSchema,
  email: z.string().email().optional().nullable(),
  phone: z.string().min(1).optional().nullable(),
  company_name: z.string().min(1).optional().nullable(),
  vat_number: z.string().min(1).optional().nullable(),
  address_line1: z.string().min(1).optional().nullable(),
  address_line2: z.string().min(1).optional().nullable(),
  postal_code: z.string().min(1).optional().nullable(),
  city: z.string().min(1).optional().nullable(),
  country: z.string().min(1).optional().nullable(),
  source_system: z.string().min(1).optional().nullable(),
  source_external_id: z.string().min(1).optional().nullable(),
  notes: z.string().optional().nullable(),
});

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeEmail(value: unknown): string | null {
  const email = String(value ?? "").trim().toLowerCase();
  return email.length > 0 ? email : null;
}

function normalizePhone(value: unknown): string | null {
  const phone = String(value ?? "").trim();
  return phone.length > 0 ? phone : null;
}

function normalizeNullableText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function normalizeName(value: unknown): string {
  const name = String(value ?? "").trim();
  return name.length > 0 ? name : "Sans nom";
}

function normalizeSourceSystem(value: unknown): string | null {
  const sourceSystem = String(value ?? "").trim().toLowerCase();
  return sourceSystem.length > 0 ? sourceSystem : null;
}

function mergeContactType(
  currentType: ContactType | string | null | undefined,
  nextType: ContactType
): ContactType {
  const current = String(currentType ?? "").trim().toLowerCase();

  if (current === "both" || nextType === "both") {
    return "both";
  }

  if (!current) {
    return nextType;
  }

  if (current === nextType) {
    return nextType;
  }

  if (
    (current === "client" && nextType === "supplier") ||
    (current === "supplier" && nextType === "client")
  ) {
    return "both";
  }

  return nextType;
}

function buildExternalEntityType(contactType: ContactType): ExternalEntityType {
  return contactType === "supplier" ? "supplier" : "customer";
}

async function syncExternalContactMapping(params: {
  userId: string;
  sourceSystem: AccountingSource;
  contactType: ContactType;
  sourceExternalId: string | null | undefined;
  contactId: string;
}): Promise<void> {
  const sourceExternalId = String(params.sourceExternalId ?? "").trim();
  if (!sourceExternalId) {
    return;
  }

  await ExternalIdMapService.upsertExternalMapping({
    userId: params.userId,
    sourceSystem: params.sourceSystem,
    externalEntityType: buildExternalEntityType(params.contactType),
    externalId: sourceExternalId,
    internalId: params.contactId,
  });
}

export class ContactsService {
  static async createContact(
    userId: string,
    input: unknown
  ): Promise<ContactRow> {
    const parsed = CreateContactSchema.safeParse(input);
    if (!parsed.success) {
      throw new HttpError(400, "Invalid contact payload");
    }

    const payload = parsed.data;

    const { data, error } = await supabaseAdmin
      .from("contacts")
      .insert({
        user_id: userId,
        name: normalizeName(payload.name),
        contact_type: payload.contact_type,
        email: normalizeEmail(payload.email),
        phone: normalizePhone(payload.phone),
        company_name: normalizeNullableText(payload.company_name),
        vat_number: normalizeNullableText(payload.vat_number),
        address_line1: normalizeNullableText(payload.address_line1),
        address_line2: normalizeNullableText(payload.address_line2),
        postal_code: normalizeNullableText(payload.postal_code),
        city: normalizeNullableText(payload.city),
        country: normalizeNullableText(payload.country),
        source_system: normalizeSourceSystem(payload.source_system),
        source_external_id: normalizeNullableText(payload.source_external_id),
        notes: normalizeNullableText(payload.notes),
      })
      .select("*")
      .single();

    if (error) {
      logger.error("ContactsService.createContact failed", {
        userId,
        message: error.message,
      });
      throw new HttpError(500, "Failed to create contact");
    }

    const contact = data as ContactRow;

    const sourceSystem = normalizeSourceSystem(payload.source_system);
    const sourceExternalId = normalizeNullableText(payload.source_external_id);

    if (
      sourceSystem &&
      sourceExternalId &&
      (sourceSystem === "odoo" ||
        sourceSystem === "pennylane" ||
        sourceSystem === "file_import" ||
        sourceSystem === "manual" ||
        sourceSystem === "artisanpro")
    ) {
      await syncExternalContactMapping({
        userId,
        sourceSystem: sourceSystem as AccountingSource,
        contactType: payload.contact_type,
        sourceExternalId,
        contactId: contact.id,
      });
    }

    return contact;
  }

  static async listContacts(userId: string): Promise<ContactRow[]> {
    const { data, error } = await supabaseAdmin
      .from("contacts")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      logger.error("ContactsService.listContacts failed", {
        userId,
        message: error.message,
      });
      throw new HttpError(500, "Failed to list contacts");
    }

    return (data ?? []) as ContactRow[];
  }

  static async getContact(userId: string, contactId: string): Promise<ContactRow> {
    const { data, error } = await supabaseAdmin
      .from("contacts")
      .select("*")
      .eq("id", contactId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      logger.error("ContactsService.getContact failed", {
        userId,
        contactId,
        message: error.message,
      });
      throw new HttpError(500, "Failed to load contact");
    }

    if (!data) {
      throw new HttpError(404, "Contact not found");
    }

    return data as ContactRow;
  }

  static async updateContact(
    userId: string,
    contactId: string,
    input: unknown
  ): Promise<ContactRow> {
    const parsed = UpdateContactSchema.safeParse(input);
    if (!parsed.success) {
      throw new HttpError(400, "Invalid contact payload");
    }

    const patch = parsed.data;

    const updatePayload: Record<string, unknown> = {};

    if (patch.name !== undefined) {
      updatePayload.name = normalizeName(patch.name);
    }

    if (patch.contact_type !== undefined) {
      updatePayload.contact_type = patch.contact_type;
    }

    if (patch.email !== undefined) {
      updatePayload.email = normalizeEmail(patch.email);
    }

    if (patch.phone !== undefined) {
      updatePayload.phone = normalizePhone(patch.phone);
    }

    if (patch.company_name !== undefined) {
      updatePayload.company_name = normalizeNullableText(patch.company_name);
    }

    if (patch.vat_number !== undefined) {
      updatePayload.vat_number = normalizeNullableText(patch.vat_number);
    }

    if (patch.address_line1 !== undefined) {
      updatePayload.address_line1 = normalizeNullableText(patch.address_line1);
    }

    if (patch.address_line2 !== undefined) {
      updatePayload.address_line2 = normalizeNullableText(patch.address_line2);
    }

    if (patch.postal_code !== undefined) {
      updatePayload.postal_code = normalizeNullableText(patch.postal_code);
    }

    if (patch.city !== undefined) {
      updatePayload.city = normalizeNullableText(patch.city);
    }

    if (patch.country !== undefined) {
      updatePayload.country = normalizeNullableText(patch.country);
    }

    if (patch.source_system !== undefined) {
      updatePayload.source_system = normalizeSourceSystem(patch.source_system);
    }

    if (patch.source_external_id !== undefined) {
      updatePayload.source_external_id = normalizeNullableText(
        patch.source_external_id
      );
    }

    if (patch.notes !== undefined) {
      updatePayload.notes = normalizeNullableText(patch.notes);
    }

    const { data, error } = await supabaseAdmin
      .from("contacts")
      .update(updatePayload)
      .eq("id", contactId)
      .eq("user_id", userId)
      .select("*")
      .single();

    if (error) {
      logger.error("ContactsService.updateContact failed", {
        userId,
        contactId,
        message: error.message,
      });
      throw new HttpError(500, "Failed to update contact");
    }

    return data as ContactRow;
  }

  static async findByExternalMapping(params: {
    userId: string;
    sourceSystem: AccountingSource;
    contactType: ContactType;
    sourceExternalId: string | null | undefined;
  }): Promise<ContactRow | null> {
    const sourceExternalId = normalizeNullableText(params.sourceExternalId);
    if (!sourceExternalId) {
      return null;
    }

    const internalId = await ExternalIdMapService.findInternalId({
      userId: params.userId,
      sourceSystem: params.sourceSystem,
      externalEntityType: buildExternalEntityType(params.contactType),
      externalId: sourceExternalId,
    });

    if (!internalId) {
      return null;
    }

    try {
      return await ContactsService.getContact(params.userId, internalId);
    } catch (error) {
      logger.warn("ContactsService.findByExternalMapping stale mapping", {
        userId: params.userId,
        sourceSystem: params.sourceSystem,
        sourceExternalId,
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  static async findExistingContact(params: {
    userId: string;
    name: string;
    contactType: ContactType;
    email?: string | null;
    phone?: string | null;
  }): Promise<ContactRow | null> {
    const normalizedEmail = normalizeEmail(params.email);
    const normalizedPhone = normalizePhone(params.phone);
    const normalizedName = normalizeName(params.name);

    if (normalizedEmail) {
      const { data, error } = await supabaseAdmin
        .from("contacts")
        .select("*")
        .eq("user_id", params.userId)
        .ilike("email", normalizedEmail)
        .limit(1)
        .maybeSingle();

      if (error) {
        logger.warn("ContactsService.findExistingContact email lookup failed", {
          userId: params.userId,
          email: normalizedEmail,
          message: error.message,
        });
      } else if (data) {
        return data as ContactRow;
      }
    }

    if (normalizedPhone) {
      const { data, error } = await supabaseAdmin
        .from("contacts")
        .select("*")
        .eq("user_id", params.userId)
        .eq("phone", normalizedPhone)
        .limit(1)
        .maybeSingle();

      if (error) {
        logger.warn("ContactsService.findExistingContact phone lookup failed", {
          userId: params.userId,
          phone: normalizedPhone,
          message: error.message,
        });
      } else if (data) {
        return data as ContactRow;
      }
    }

    const { data, error } = await supabaseAdmin
      .from("contacts")
      .select("*")
      .eq("user_id", params.userId)
      .ilike("name", normalizedName)
      .limit(1)
      .maybeSingle();

    if (error) {
      logger.warn("ContactsService.findExistingContact name lookup failed", {
        userId: params.userId,
        name: normalizedName,
        message: error.message,
      });
      return null;
    }

    return (data as ContactRow | null) ?? null;
  }

  static async findOrCreateContact(params: {
    userId: string;
    sourceSystem: AccountingSource;
    input: unknown;
  }): Promise<ContactRow> {
    const parsed = FindOrCreateContactSchema.safeParse(params.input);
    if (!parsed.success) {
      throw new HttpError(400, "Invalid contact payload");
    }

    const payload = parsed.data;

    const sourceExternalId = normalizeNullableText(payload.source_external_id);

    const mapped = await ContactsService.findByExternalMapping({
      userId: params.userId,
      sourceSystem: params.sourceSystem,
      contactType: payload.contact_type,
      sourceExternalId,
    });

    if (mapped) {
      const mergedType = mergeContactType(mapped.contact_type, payload.contact_type);

      const patch: Record<string, unknown> = {
        contact_type: mergedType,
      };

      const nextName = normalizeName(payload.name);
      if (nextName.length > 0 && nextName !== mapped.name) {
        patch.name = nextName;
      }

      const nextEmail = normalizeEmail(payload.email);
      if (nextEmail && nextEmail !== mapped.email) {
        patch.email = nextEmail;
      }

      const nextPhone = normalizePhone(payload.phone);
      if (nextPhone && nextPhone !== mapped.phone) {
        patch.phone = nextPhone;
      }

      const nextCompanyName = normalizeNullableText(payload.company_name);
      if (nextCompanyName && nextCompanyName !== mapped.company_name) {
        patch.company_name = nextCompanyName;
      }

      const nextVatNumber = normalizeNullableText(payload.vat_number);
      if (nextVatNumber && nextVatNumber !== mapped.vat_number) {
        patch.vat_number = nextVatNumber;
      }

      const nextSourceSystem = normalizeSourceSystem(payload.source_system);
      if (nextSourceSystem && nextSourceSystem !== mapped.source_system) {
        patch.source_system = nextSourceSystem;
      }

      if (sourceExternalId && sourceExternalId !== mapped.source_external_id) {
        patch.source_external_id = sourceExternalId;
      }

      if (Object.keys(patch).length > 0) {
        return await ContactsService.updateContact(
          params.userId,
          mapped.id,
          patch
        );
      }

      return mapped;
    }

    const existing = await ContactsService.findExistingContact({
      userId: params.userId,
      name: payload.name,
      contactType: payload.contact_type,
      email: payload.email,
      phone: payload.phone,
    });

    if (existing) {
      const mergedType = mergeContactType(
        existing.contact_type,
        payload.contact_type
      );

      const patch: Record<string, unknown> = {
        contact_type: mergedType,
      };

      const nextEmail = normalizeEmail(payload.email);
      if (nextEmail && nextEmail !== existing.email) {
        patch.email = nextEmail;
      }

      const nextPhone = normalizePhone(payload.phone);
      if (nextPhone && nextPhone !== existing.phone) {
        patch.phone = nextPhone;
      }

      const nextCompanyName = normalizeNullableText(payload.company_name);
      if (nextCompanyName && nextCompanyName !== existing.company_name) {
        patch.company_name = nextCompanyName;
      }

      const nextVatNumber = normalizeNullableText(payload.vat_number);
      if (nextVatNumber && nextVatNumber !== existing.vat_number) {
        patch.vat_number = nextVatNumber;
      }

      const nextSourceSystem = normalizeSourceSystem(payload.source_system);
      if (nextSourceSystem && nextSourceSystem !== existing.source_system) {
        patch.source_system = nextSourceSystem;
      }

      if (sourceExternalId && sourceExternalId !== existing.source_external_id) {
        patch.source_external_id = sourceExternalId;
      }

      const updated = await ContactsService.updateContact(
        params.userId,
        existing.id,
        patch
      );

      await syncExternalContactMapping({
        userId: params.userId,
        sourceSystem: params.sourceSystem,
        contactType: payload.contact_type,
        sourceExternalId,
        contactId: updated.id,
      });

      return updated;
    }

    const created = await ContactsService.createContact(params.userId, {
      ...payload,
      source_system:
        normalizeSourceSystem(payload.source_system) ?? params.sourceSystem,
      source_external_id: sourceExternalId,
    });

    await syncExternalContactMapping({
      userId: params.userId,
      sourceSystem: params.sourceSystem,
      contactType: payload.contact_type,
      sourceExternalId,
      contactId: created.id,
    });

    return created;
  }
}