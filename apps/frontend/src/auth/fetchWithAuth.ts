import { useAuth } from "../store/auth.store";
import { refresh } from "../api/auth.api";

export async function fetchWithAuth(
  input: RequestInfo,
  init: RequestInit = {}
): Promise<Response> {
  const auth = useAuth.getState();

  const headers = new Headers(init.headers);
  if (auth.accessToken) {
    headers.set("Authorization", `Bearer ${auth.accessToken}`);
  }

  let res = await fetch(input, {
    ...init,
    headers,
    credentials: "include",
  });

  if (res.status !== 401) return res;

  const refreshed = await refresh();
  if (!refreshed?.accessToken) {
    await auth.logout();
    throw new Error("Session expirée");
  }

  useAuth.setState({ accessToken: refreshed.accessToken });

  headers.set(
    "Authorization",
    `Bearer ${refreshed.accessToken}`
  );

  return fetch(input, {
    ...init,
    headers,
    credentials: "include",
  });
}


