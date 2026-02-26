// src/auth/fetchWithAuth.ts

import { API_URL } from "../config/api";
import { supabase } from "../lib/supabase";

/**
 * 🔐 Fetch sécurisé avec token Supabase
 */
export async function fetchWithAuth<T = unknown>(
  input: string,
  init: RequestInit = {}
): Promise<T> {
  try {
    // 1️⃣ Récupération session Supabase
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const headers = new Headers(init.headers ?? {});

    // 2️⃣ Injection du JWT
    if (session?.access_token) {
      headers.set("Authorization", `Bearer ${session.access_token}`);
    }

    // 3️⃣ Content-Type automatique si body JSON
    // ⚠️ Ne jamais forcer le Content-Type pour FormData (le navigateur gère le boundary).
    if (init.body && !headers.has("Content-Type")) {
      const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
      if (!isFormData) headers.set("Content-Type", "application/json");
    }

    const url = `${API_URL}${input}`;

    // 🔎 DEBUG (tu peux supprimer après)
    console.log("🌍 API CALL:", url);

    // 4️⃣ Appel API
    const response = await fetch(url, {
      ...init,
      headers,
      cache: "no-store",
    });

    // 5️⃣ Gestion 401 → logout automatique
    if (response.status === 401) {
      await supabase.auth.signOut();
      window.location.href = "/login";
      throw new Error("Session expirée");
    }

    // 6️⃣ Gestion erreurs HTTP
    if (!response.ok) {
      let message = `Erreur HTTP ${response.status}`;

      try {
        const errorData = await response.json();
        if (errorData?.message) {
          message = errorData.message;
        }
      } catch {
        // ignore si pas JSON
      }

      console.error("❌ API ERROR:", message);
      throw new Error(message);
    }

    // 7️⃣ Si 204 → rien à retourner
    if (response.status === 204) {
      return undefined as T;
    }

    // 8️⃣ Parse JSON si présent
    const contentType = response.headers.get("content-type");

    if (contentType?.includes("application/json")) {
      return (await response.json()) as T;
    }

    return undefined as T;

  } catch (error) {
    console.error("fetchWithAuth error:", error);
    throw error;
  }
}
