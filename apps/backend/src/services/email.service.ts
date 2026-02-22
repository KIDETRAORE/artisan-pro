import { Resend } from 'resend';
import { logger } from "../utils/logger";

// Initialisation de Resend avec la clé de ton .env
const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Envoie un email de relance via l'API Resend
 */
export async function sendReminderEmail(to: string, subject: string, content: string) {
  try {
    logger.info(`📨 [RESEND] Tentative d'envoi à : ${to}`);

    // Configuration de l'envoi
    const { data, error } = await resend.emails.send({
      // ⚠️ IMPORTANT : En mode test/gratuit, utilise 'onboarding@resend.dev'
      from: 'ArtisanPro <onboarding@resend.dev>', 
      to: to,
      subject: subject,
      html: `
        <div style="font-family: sans-serif; line-height: 1.5; color: #333;">
          ${content.replace(/\n/g, '<br>')}
        </div>
      `,
    });

    if (error) {
      logger.error("❌ [RESEND ERROR] Détails :", error);
      throw new Error(error.message);
    }

    logger.info(`📧 [EMAIL SENT] ID Resend: ${data?.id} | Vers: ${to}`);
    return { success: true, id: data?.id };

  } catch (error: any) {
    logger.error("❌ [EMAIL SERVICE EXCEPTION]", error.message);
    throw error;
  }
}