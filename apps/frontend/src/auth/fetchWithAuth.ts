import { API_URL } from "../config/api";
import { useAuth } from "../store/auth.store";

/**
 * Fetch sécurisé avec :
 * - Authorization Bearer
 * - cookies httpOnly
 * - refresh automatique
 */
export async function fetchWithAuth(
  input: RequestInfo,
  init: RequestInit = {}
): Promise<Response> {
  const { accessToken, restoreSession, logout } = useAuth.getState();

  const headers = new Headers(init.headers);

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  let res = await fetch(`${API_URL}${input}`, {
    ...init,
    headers,
    credentials: "include",
  });

  // ✅ Tout va bien
  if (res.status !== 401) {
    return res;
  }

  /**
   * 🔁 Token expiré → restore session
   */
  try {
    await restoreSession();

    const newAccessToken = useAuth.getState().accessToken;
    if (!newAccessToken) {
      throw new Error("Refresh failed");
    }

    headers.set("Authorization", `Bearer ${newAccessToken}`);

    return fetch(`${API_URL}${input}`, {
      ...init,
      headers,
      credentials: "include",
    });
  } catch {
    await logout();
    throw new Error("Session expirée");
  }
}


