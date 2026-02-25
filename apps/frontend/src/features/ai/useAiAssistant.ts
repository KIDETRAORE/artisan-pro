import { useState } from "react";
import { useAuth } from "../../store/auth.store";

const API_URL = import.meta.env.VITE_API_URL
  ? `${String(import.meta.env.VITE_API_URL).replace(/\/$/, "")}`
  : "http://localhost:8080";

interface AiResponse {
  advice?: string[];
  forecast?: {
    expectedNext30Days: number;
  };
}

function buildAuthHeaders(accessToken?: string | null): Record<string, string> {
  const headers: Record<string, string> = {};
  if (accessToken && accessToken.trim().length > 0) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  return headers;
}

export function useAiAssistant() {
  const { accessToken } = useAuth();
  const [data, setData] = useState<AiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStrategy = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`${API_URL}/ai/strategy`, {
        headers: buildAuthHeaders(accessToken),
      });

      if (!res.ok) throw new Error("Erreur stratégie IA");
      const json: any = await res.json();

      const advice =
        Array.isArray(json.advice) ? (json.advice as string[]) : [String(json.advice ?? "")];

      setData((prev) => ({ ...(prev ?? {}), advice }));
    } catch (err: any) {
      setError(err?.message || "Erreur stratégie IA");
    } finally {
      setLoading(false);
    }
  };

  const fetchForecast = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`${API_URL}/ai/forecast`, {
        headers: buildAuthHeaders(accessToken),
      });

      if (!res.ok) throw new Error("Erreur prévision IA");
      const json: any = await res.json();

      setData((prev) => ({ ...(prev ?? {}), forecast: json }));
    } catch (err: any) {
      setError(err?.message || "Erreur prévision IA");
    } finally {
      setLoading(false);
    }
  };

  const triggerAutomation = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`${API_URL}/automation/run-reminders`, {
        method: "POST",
        headers: buildAuthHeaders(accessToken),
      });

      return res.ok;
    } catch {
      return false;
    } finally {
      setLoading(false);
    }
  };

  return { data, loading, error, fetchStrategy, fetchForecast, triggerAutomation };
}