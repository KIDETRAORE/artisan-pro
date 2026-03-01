import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { logger } from "../../utils/logger";
import { normalizePlan } from "../../domain/plan";

export async function getArtisanContext(userId: string): Promise<string> {
  try {
    const { data, error } = await supabaseAdmin.rpc("get_user_context", {
      uid: userId,
    });
    if (error) throw error;

    const ctx = data?.[0];

    const plan = normalizePlan(ctx?.plan);

    let context = `--- PROFIL ARTISAN ---\n`;
    context += `Nom: ${ctx?.full_name || "Inconnu"} | Entreprise: ${
      ctx?.company_name || "N/A"
    } | Plan: ${plan}\n`;

    context += `\n--- PROJETS RÉCENTS ---\n`;
    context += "Aucun projet actif.\n";

    context += `\n--- ÉTAT DU CASHFLOW ---\n`;
    context += "Toutes les factures sont payées. Félicitations !\n";

    return context;
  } catch (error) {
    logger.error("Erreur Context Builder", { error, userId });
    return "Contexte indisponible.";
  }
}