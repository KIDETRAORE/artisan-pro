import { supabaseAdmin } from "../lib/supabaseAdmin";

/**
 * Récupérer un profil utilisateur
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

  return data;
}

/**
 * Mettre à jour les informations non sensibles du profil
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
