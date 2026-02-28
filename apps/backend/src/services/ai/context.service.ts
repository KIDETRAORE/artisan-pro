import pool from "../../config/db";
import { logger } from "../../utils/logger";
import { normalizePlan } from "../../domain/plan";

export async function getArtisanContext(userId: string): Promise<string> {
  try {
    const profileRes = await pool.query(
      "SELECT full_name, company_name, plan FROM profiles WHERE id = $1",
      [userId]
    );
    const projectsRes = await pool.query(
      "SELECT name, address FROM projects WHERE user_id = $1 ORDER BY created_at DESC LIMIT 3",
      [userId]
    );

    const invoicesRes = await pool.query(
      `SELECT total_amount, status, due_date, client_name 
       FROM invoices 
       WHERE user_id = $1 AND status = 'UNPAID' 
       ORDER BY due_date ASC`,
      [userId]
    );

    const profile = profileRes.rows[0];
    const projects = projectsRes.rows;
    const unpaid = invoicesRes.rows;

    let context = `--- PROFIL ARTISAN ---\n`;
    context += `Nom: ${profile?.full_name || "Inconnu"} | Entreprise: ${
      profile?.company_name || "N/A"
    } | Plan: ${normalizePlan(profile?.plan)}\n`; // ✅ C

    context += `\n--- PROJETS RÉCENTS ---\n`;
    if (projects.length > 0) {
      projects.forEach((p) => (context += `- ${p.name} (${p.address || "No address"})\n`));
    } else {
      context += "Aucun projet actif.\n";
    }

    context += `\n--- ÉTAT DU CASHFLOW ---\n`;
    if (unpaid.length > 0) {
      const total = unpaid.reduce((sum, inv) => sum + Number(inv.total_amount), 0);
      const late = unpaid.filter((inv) => new Date(inv.due_date) < new Date()).length;

      context += `- Factures impayées: ${unpaid.length}\n`;
      context += `- Montant total à recouvrer: ${total.toFixed(2)} €\n`;
      context += `- Retards critiques: ${late} facture(s)\n`;

      unpaid.slice(0, 2).forEach((inv) => {
        context += `  * Client: ${inv.client_name} | Due: ${inv.total_amount}€ | Date: ${new Date(
          inv.due_date
        ).toLocaleDateString()}\n`;
      });
    } else {
      context += "Toutes les factures sont payées. Félicitations !\n";
    }

    return context;
  } catch (error) {
    logger.error("Erreur Context Builder", { error, userId });
    return "Contexte indisponible.";
  }
}