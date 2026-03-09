// src/auth/fetchWithAuth.ts

import { API_URL } from "../config/api";
import { supabase } from "../lib/supabase";
import { ApiRequestError, toApiRequestError } from "../utils/apiRequestError";

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

    // 3️⃣ Content-Type automatique si body JSON (⚠️ pas pour FormData/Blob)
    if (typeof init.body === "string" && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const url = `${API_URL}${input}`;

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
      throw new ApiRequestError({
        code: "unauthorized",
        message: "Session expirée",
        requestId: "unknown",
        status: 401,
      });
    }

    // 6️⃣ Gestion erreurs HTTP (standardisées)
    if (!response.ok) {
      throw await toApiRequestError(response);
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
    throw error;
  }
}