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
      <div className="flex min-h-[60vh] items-center justify-center text-[var(--theme-text)]">
        <div className="flex items-center gap-2 font-semibold text-[var(--theme-muted)]">
          <Loader2
            className="animate-spin"
            style={{ color: "var(--theme-primary)" }}
            size={18}
          />
          Vérification du lien…
        </div>
      </div>
    );
  }

  if (!hasSession) {
    return (
      <div className="mx-auto max-w-md space-y-4 p-6 text-[var(--theme-text)]">
        <h2 className="text-xl font-black text-[var(--theme-text)]">
          Lien invalide ou expiré
        </h2>
        <p className="text-sm text-[var(--theme-muted)]">
          Le lien de réinitialisation n’est plus valide. Retourne dans{" "}
          <span className="font-bold">Paramètres</span> et renvoie un nouvel
          email.
        </p>
        <button
          onClick={() => navigate("/settings")}
          className="w-full rounded-xl py-3 font-bold text-white"
          style={{ backgroundColor: "var(--theme-primary)" }}
        >
          Retour aux paramètres
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-5 p-6 text-[var(--theme-text)]">
      <div>
        <h2 className="text-2xl font-black text-[var(--theme-text)]">
          Nouveau mot de passe
        </h2>
        <p className="mt-1 text-sm text-[var(--theme-muted)]">
          Choisis un mot de passe sécurisé (8 caractères minimum).
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-sm font-bold text-[var(--theme-text)]">
            Nouveau mot de passe
          </label>
          <div className="relative mt-2">
            <Lock
              className="absolute left-3 top-3 text-[var(--theme-muted)]"
              size={18}
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] py-3 pl-10 pr-4 text-[var(--theme-text)] outline-none transition-all placeholder:text-[var(--theme-muted)] focus:ring-2"
              style={{ ["--tw-ring-color" as any]: "var(--theme-primary)" }}
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-bold text-[var(--theme-text)]">
            Confirmer le mot de passe
          </label>
          <div className="relative mt-2">
            <CheckCircle2
              className="absolute left-3 top-3 text-[var(--theme-muted)]"
              size={18}
            />
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] py-3 pl-10 pr-4 text-[var(--theme-text)] outline-none transition-all placeholder:text-[var(--theme-muted)] focus:ring-2"
              style={{ ["--tw-ring-color" as any]: "var(--theme-primary)" }}
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
        className="flex w-full items-center justify-center gap-2 rounded-xl py-3 font-bold text-white disabled:opacity-50"
        style={{ backgroundColor: "var(--theme-primary)" }}
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

      <p className="text-[11px] font-semibold text-[var(--theme-muted)]">
        Si tu as reçu ce lien par erreur, tu peux simplement fermer cette page.
      </p>
    </div>
  );
}