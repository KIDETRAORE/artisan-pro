// apps/frontend/src/pages/ResetPassword.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { toast } from "react-hot-toast";
import { Loader2, Lock, CheckCircle2 } from "lucide-react";

export default function ResetPassword() {
  const navigate = useNavigate();

  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(() => {
    return (
      ready &&
      hasSession &&
      !loading &&
      password.length >= 8 &&
      confirm.length >= 8 &&
      password === confirm
    );
  }, [ready, hasSession, loading, password, confirm]);

  // ✅ Récupère la session/token depuis l’URL (flow Supabase recovery)
  useEffect(() => {
    const init = async () => {
      try {
        // 1) Si Supabase a déjà une session, ok
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session) {
          setHasSession(true);
          setReady(true);
          return;
        }

        // 2) Sinon, on tente d’échanger un code (flow le plus courant en 2026)
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");

        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(
            window.location.href
          );

          if (!error && data?.session) {
            setHasSession(true);
            setReady(true);
            return;
          }
        }

        // 3) Fallback: anciens flows hash (#access_token=...)
        const hash = window.location.hash || "";
        if (hash.includes("access_token=") || hash.includes("type=recovery")) {
          // Supabase-js traite le hash lors de getSession() / onAuthStateChange
          // On re-check juste après un micro délai
          await new Promise((r) => setTimeout(r, 200));
          const {
            data: { session: s2 },
          } = await supabase.auth.getSession();

          setHasSession(!!s2);
          setReady(true);
          return;
        }

        setHasSession(false);
        setReady(true);
      } catch {
        setHasSession(false);
        setReady(true);
      }
    };

    init();
  }, []);

  const submit = async () => {
    if (!canSubmit) return;

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      toast.success("Mot de passe mis à jour.");
      navigate("/settings", { replace: true });
    } catch (e: any) {
      toast.error(e?.message ?? "Impossible de mettre à jour le mot de passe.");
    } finally {
      setLoading(false);
    }
  };

  if (!ready) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex items-center gap-2 text-slate-600 font-semibold">
          <Loader2 className="animate-spin" size={18} />
          Vérification du lien…
        </div>
      </div>
    );
  }

  if (!hasSession) {
    return (
      <div className="max-w-md mx-auto p-6 space-y-4">
        <h2 className="text-xl font-black text-slate-900">
          Lien invalide ou expiré
        </h2>
        <p className="text-sm text-slate-600">
          Le lien de réinitialisation n’est plus valide. Retourne dans{" "}
          <span className="font-bold">Paramètres</span> et renvoie un nouvel
          email.
        </p>
        <button
          onClick={() => navigate("/settings")}
          className="w-full py-3 rounded-xl bg-slate-900 text-white font-bold"
        >
          Retour aux paramètres
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto p-6 space-y-5">
      <div>
        <h2 className="text-2xl font-black text-slate-900">
          Nouveau mot de passe
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Choisis un mot de passe sécurisé (8 caractères minimum).
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-sm font-bold text-slate-700">
            Nouveau mot de passe
          </label>
          <div className="relative mt-2">
            <Lock className="absolute left-3 top-3 text-slate-400" size={18} />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-100 border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-bold text-slate-700">
            Confirmer le mot de passe
          </label>
          <div className="relative mt-2">
            <CheckCircle2
              className="absolute left-3 top-3 text-slate-400"
              size={18}
            />
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-100 border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </div>

          {confirm.length > 0 && password !== confirm && (
            <p className="mt-2 text-xs font-bold text-red-600">
              Les mots de passe ne correspondent pas.
            </p>
          )}
        </div>
      </div>

      <button
        onClick={submit}
        disabled={!canSubmit}
        className="w-full py-3 rounded-xl bg-slate-900 text-white font-bold disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <Loader2 className="animate-spin" size={18} />
            Mise à jour…
          </>
        ) : (
          "Mettre à jour"
        )}
      </button>

      <p className="text-[11px] text-slate-400 font-semibold">
        Si tu as reçu ce lien par erreur, tu peux simplement fermer cette page.
      </p>
    </div>
  );
}