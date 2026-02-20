import { supabaseAdmin } from "../lib/supabaseAdmin";

/**
 * 🔢 Calcul du quota selon le plan
 * Centralisation de la logique métier
 */
function computeQuota(profile: any) {
  const plan = profile.plan ?? "FREE";
  const used = profile.quota_used ?? 0;

  // Plan PRO = illimité
  if (plan === "PRO") {
    return {
      used,
      limit: 999999, // on garde un nombre pour éviter les null côté frontend
    };
  }

  // Plan FREE
  return {
    used,
    limit: 10, // limite FREE (à ajuster si besoin)
  };
}

/**
 * 👤 Récupérer un profil utilisateur enrichi avec quota
 */
export async function getUserProfile(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error) {
    console.error("Supabase fetch error:", error);
    throw error;
  }

  if (!data) {
    throw new Error("User profile not found");
  }

  return {
    ...data,
    quota: computeQuota(data),
  };
}

/**
 * ✏️ Mettre à jour les informations non sensibles du profil
 * ⚠️ NE PAS inclure plan, stripe_customer_id, subscription_status
 */
export async function updateUserProfile(
  userId: string,
  updates: {
    full_name?: string;
    avatar_url?: string;
  }
) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update(updates)
    .eq("id", userId)
    .select()
    .single();

  if (error) {
    console.error("Supabase update error:", error);
    throw error;
  }

  return data;
}

/**
 * ➕ Incrémenter le quota après une action réussie
 * (à appeler après une analyse validée par exemple)
 */
export async function incrementQuota(userId: string) {
  const { data, error } = await supabaseAdmin.rpc("increment_quota_used", {
    user_id: userId,
  });

  if (error) {
    console.error("Quota increment error:", error);
    throw error;
  }

  return data;
}