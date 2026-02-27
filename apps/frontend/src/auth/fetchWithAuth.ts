// src/auth/fetchWithAuth.ts
import { API_URL } from "../config/api";
import { supabase } from "../lib/supabase";
import { ApiError } from "./ApiError";

type ErrorPayload = {
  message?: string;
  error?: { code?: string; message?: string } | string;
  code?: string;
};

export async function fetchWithAuth<T = unknown>(
  input: string,
  init: RequestInit = {}
): Promise<T> {
  try {
    const { data: { session } } = await supabase.auth.getSession();

    const headers = new Headers(init.headers ?? {});

    if (session?.access_token) {
      headers.set("Authorization", `Bearer ${session.access_token}`);
    }

    if (init.body && !headers.has("Content-Type")) {
      const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
      if (!isFormData) headers.set("Content-Type", "application/json");
    }

    const url = `${API_URL}${input}`;

    const response = await fetch(url, {
      ...init,
      headers,
      cache: "no-store",
    });

    if (response.status === 401) {
      await supabase.auth.signOut();
      window.location.href = "/login";
      throw new ApiError(401, "Session expirée", "unauthorized");
    }

    if (!response.ok) {
      let message = `Erreur HTTP ${response.status}`;
      let code: string | undefined;

      try {
        const errorData = (await response.json()) as ErrorPayload;

        // formats possibles
        if (typeof errorData?.error === "string") {
          message = errorData.error;
        } else if (errorData?.error?.message) {
          message = errorData.error.message;
          code = errorData.error.code;
        } else if (errorData?.message) {
          message = errorData.message;
        }

        if (!code && typeof errorData?.code === "string") code = errorData.code;
      } catch {
        // ignore si pas JSON
      }

      // Améliorations UX
      if (response.status === 429) {
        code = code ?? "rate_limited";
        message = "Trop de requêtes. Réessaie dans quelques secondes.";
      }

      throw new ApiError(response.status, message, code);
    }

    if (response.status === 204) return undefined as T;

    const contentType = response.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      return (await response.json()) as T;
    }

    return undefined as T;
  } catch (error) {
    throw error;
  }
}