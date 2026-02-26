import { Resend } from "resend";
import { logger } from "../utils/logger";
import { ENV } from "../config/env";

// Initialisation Resend via ENV (centralisé + validé en prod)
const resend = new Resend(ENV.RESEND_API_KEY);

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
    if (!ENV.RESEND_API_KEY) {
      // En dev/test, si la clé est absente, on évite un crash incompréhensible
      // (en prod elle est déjà forcée par env.ts)
      throw new Error("RESEND_API_KEY is not configured");
    }

    logger.info("[RESEND] Sending email", { to });

    const { data, error } = await resend.emails.send({
      // ⚠️ IMPORTANT : en mode test/gratuit, utilise onboarding@resend.dev
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
      // Ne pas logger l'objet brut (peut contenir détails internes)
      const message =
        typeof (error as any)?.message === "string"
          ? (error as any).message
          : "Unknown Resend error";

      logger.error("[RESEND] API error", { to, message });
      throw new Error(message);
    }

    logger.info("[RESEND] Email sent", { to, id: data?.id });
    return { success: true, id: data?.id };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[RESEND] Email send failed", { to, message });
    throw err instanceof Error ? err : new Error(message);
  }
}