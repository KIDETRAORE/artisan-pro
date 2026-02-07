import { supabaseAdmin } from './supabaseAdmin.ts';

/**
 * RÉFÉRENTIEL DES POIDS (Coût en points)
 */
const FEATURE_WEIGHTS: Record<string, number> = {
  assistant: 1,
  devis: 2,
  vision: 10, 
  compta: 3,
  relance: 1
};

/**
 * PLAFONDS STRICTS PAR FONCTIONNALITÉ (Nombre d'utilisations max)
 * Permet de limiter les fonctionnalités coûteuses indépendamment du crédit global.
 */
export const FEATURE_CAPS: Record<string, number> = {
  vision: 15, // Max 15 photos par mois
  compta: 10, // Max 10 audits comptables par mois
};

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export const quotaService = {
  /**
   * Vérifie le solde global ET les limites spécifiques à la fonctionnalité.
   */
  async checkAndLockQuota(userId: string, feature: string): Promise<{ allowed: boolean; reason?: string }> {
    const weight = FEATURE_WEIGHTS[feature] || 1;

    let { data: quota, error } = await supabaseAdmin
      .from('ai_quota')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (!quota) {
      const { data: newQuota } = await supabaseAdmin
        .from('ai_quota')
        .insert({
          user_id: userId,
          monthly_limit: 100,
          used: 0,
          reset_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        })
        .select()
        .single();
      quota = newQuota;
    }

    const now = new Date();
    let resetAt = new Date(quota.reset_at);

    // 1. Gestion du Reset Mensuel
    if (now > resetAt) {
      const nextReset = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: resetQuota } = await supabaseAdmin
        .from('ai_quota')
        .update({ used: 0, reset_at: nextReset })
        .eq('user_id', userId)
        .select()
        .single();
      if (resetQuota) {
        quota = resetQuota;
        resetAt = new Date(nextReset);
      }
    }

    // Calcul du début de la période actuelle (30 jours avant le reset_at stocké)
    const periodStart = new Date(resetAt.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // 2. Vérification de la LIMITE PAR FONCTIONNALITÉ (Feature Cap)
    const cap = FEATURE_CAPS[feature];
    if (cap) {
      const { count, error: countError } = await supabaseAdmin
        .from('ai_usage')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('feature', feature)
        .gte('created_at', periodStart);

      if (!countError && count !== null && count >= cap) {
        return { 
          allowed: false, 
          reason: `Limite de ${cap} utilisations pour la fonction '${feature}' atteinte ce mois-ci.` 
        };
      }
    }

    // 3. Vérification du QUOTA GLOBAL (Credits)
    if (quota.used + weight > quota.monthly_limit) {
      return { 
        allowed: false, 
        reason: `Solde de crédits IA insuffisant (${quota.used}/${quota.monthly_limit}).` 
      };
    }

    return { allowed: true };
  },

  /**
   * Enregistre l'usage RÉEL après succès confirmé de Gemini.
   */
  async recordUsage(userId: string, feature: string, input?: string, output?: string) {
    try {
      const weight = FEATURE_WEIGHTS[feature] || 1;
      const costMultiplier = feature === "vision" ? 3 : 1;
      
      const inputTokens = input ? estimateTokens(input) : 0;
      const outputTokens = output ? estimateTokens(output) : 0;
      const totalTokens = (inputTokens + outputTokens) * costMultiplier;

      // Incrémentation du quota utilisé
      await supabaseAdmin.rpc('increment_quota', { 
        row_id: userId, 
        val: weight 
      });

      // Audit détaillé
      await supabaseAdmin.from('ai_usage').insert({
        user_id: userId,
        feature: feature,
        tokens_estimated: totalTokens > 0 ? totalTokens : weight * 100
      });
      
      console.log(`[QuotaService] SUCCESS: ${userId} used ${feature} (+${weight} pts).`);
    } catch (err) {
      console.error("[QuotaService] Record Error:", err);
    }
  },

  async getUserQuota(userId: string) {
    const { data: quota } = await supabaseAdmin
      .from('ai_quota')
      .select('used, monthly_limit, reset_at')
      .eq('user_id', userId)
      .single();
    
    if (!quota) return null;

    // Récupération de l'usage par fonctionnalité pour la période en cours
    const resetAt = new Date(quota.reset_at);
    const periodStart = new Date(resetAt.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    const { data: featureUsage } = await supabaseAdmin
      .from('ai_usage')
      .select('feature')
      .eq('user_id', userId)
      .gte('created_at', periodStart);

    const counts: Record<string, number> = {};
    featureUsage?.forEach(u => {
      counts[u.feature] = (counts[u.feature] || 0) + 1;
    });

    return {
      ...quota,
      feature_usage: counts,
      feature_caps: FEATURE_CAPS
    };
  }
};