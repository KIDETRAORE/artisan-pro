import { useState } from "react";

interface AiResponse {
  advice?: string;
  forecast?: {
    expectedNext30Days: number;
  };
}

export function useAiAssistant() {
  const [data, setData] = useState<AiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStrategy = async () => {
    try {
      setLoading(true);
      const res = await fetch("/ai/strategy", { credentials: "include" });
      if (!res.ok) throw new Error("Erreur stratégie IA");
      const json = await res.json();
      setData(prev => ({ ...prev, advice: json.advice }));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchForecast = async () => {
    try {
      setLoading(true);
      const res = await fetch("/ai/forecast", { credentials: "include" });
      if (!res.ok) throw new Error("Erreur prévision");
      const json = await res.json();
      setData(prev => ({ ...prev, forecast: json }));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const triggerAutomation = async () => {
    try {
      setLoading(true);
      const res = await fetch("/automation/run-reminders", {
        method: "POST",
        credentials: "include",
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