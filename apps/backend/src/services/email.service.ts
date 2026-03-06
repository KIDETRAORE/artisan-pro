// apps/backend/src/services/email.service.ts
import { Resend } from "resend";
import { logger } from "../utils/logger";
import { ENV } from "../config/env";
import { redactEmail } from "../utils/redact";

// Initialisation Resend via ENV (centralisé + validé en prod)
// ✅ MODIF: ne pas instancier Resend si la clé est absente
const resend =
  typeof ENV.RESEND_API_KEY === "string" && ENV.RESEND_API_KEY.trim().length > 0
    ? new Resend(ENV.RESEND_API_KEY)
    : null;

type SendReminderResult = { success: true; id?: string };

/**
 * Envoie un email de relance via l'API Resend
 */
export async function sendReminderEmail(
  to: string,
  subject: string,
  content: string
): Promise<SendReminderResult> {
  try {
    if (!ENV.RESEND_API_KEY || !resend) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    const toSafe = redactEmail(to);
    logger.info("[RESEND] Sending email", {
      toMasked: toSafe.masked,
      toDomain: toSafe.domain,
      toHash: toSafe.hash,
    });

    const { data, error } = await resend.emails.send({
      from: "ArtisanPro <onboarding@resend.dev>",
      to,
      subject,
      html: `
        <div style="font-family: sans-serif; line-height: 1.5; color: #333;">
          ${content.replace(/\n/g, "<br>")}
        </div>
      `,
    });

    if (error) {
      const message =
        typeof (error as any)?.message === "string"
          ? (error as any).message
          : "Unknown Resend error";

      // ✅ MODIF UNIQUE DEMANDÉE: ne plus logger `to` en clair
      const toSafeApiError = redactEmail(to);
      logger.error("[RESEND] API error", {
        message,
        toMasked: toSafeApiError.masked,
        toDomain: toSafeApiError.domain,
        toHash: toSafeApiError.hash,
      });

      throw new Error(message);
    }

    const toSafeSent = redactEmail(to);
    logger.info("[RESEND] Email sent", {
      id: data?.id,
      toMasked: toSafeSent.masked,
      toDomain: toSafeSent.domain,
      toHash: toSafeSent.hash,
    });

    return { success: true, id: data?.id };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    // ✅ MODIF UNIQUE DEMANDÉE: ne plus logger `to` en clair
    const toSafeFail = redactEmail(to);
    logger.error("[RESEND] Email send failed", {
      message,
      toMasked: toSafeFail.masked,
      toDomain: toSafeFail.domain,
      toHash: toSafeFail.hash,
    });

    throw err instanceof Error ? err : new Error(message);
  }
}