// apps/frontend/src/pages/Login.tsx

import React, { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { LayoutDashboard, Lock, Mail, ArrowRight, Loader2 } from "lucide-react";
import { useAuth } from "../store/auth.store";
import { toast } from "react-hot-toast";
import { ApiRequestError } from "../utils/apiRequestError";

export default function Login() {
  const { user, accessToken, isLoading, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [forceShow, setForceShow] = useState(false);

  // Sécurité : Si le chargement dure plus de 2 secondes, on force l'affichage du formulaire
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isLoading) setForceShow(true);
    }, 2000);
    return () => clearTimeout(timer);
  }, [isLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await login(email, password);
    } catch (error) {
      const err = error as ApiRequestError;
      toast.error(err?.message ?? "Erreur de connexion : identifiants incorrects.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 1. Redirection si déjà connecté
  if (user && accessToken) {
    return <Navigate to="/dashboard" replace />;
  }

  // 2. État de chargement (uniquement si pas forcé)
  if (isLoading && !forceShow) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--theme-bg)] text-[var(--theme-text)]">
        <Loader2
          className="mb-4 animate-spin"
          style={{ color: "var(--theme-primary)" }}
          size={40}
        />
        <p className="font-medium text-[var(--theme-muted)]">
          Initialisation d'ArtisanPro...
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--theme-bg)] p-4 text-[var(--theme-text)]">
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] shadow-xl animate-in fade-in zoom-in duration-500">
        <div className="p-8">
          <div className="mb-6 flex justify-center">
            <div
              className="flex h-16 w-16 items-center justify-center rounded-2xl shadow-lg"
              style={{ backgroundColor: "var(--theme-primary)" }}
            >
              <LayoutDashboard
                className="text-[var(--theme-primary-contrast)]"
                size={32}
              />
            </div>
          </div>

          <h2 className="mb-2 text-center text-2xl font-bold text-[var(--theme-text)]">
            ArtisanPro AI
          </h2>
          <p className="mb-8 text-center text-[var(--theme-muted)]">
            Connectez-vous pour accéder à vos outils.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--theme-text)]">
                Email professionnel
              </label>
              <div className="relative">
                <Mail
                  className="absolute left-3 top-3 text-[var(--theme-muted)]"
                  size={18}
                />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] py-3 pl-10 pr-4 text-[var(--theme-text)] outline-none transition-all placeholder:text-[var(--theme-muted)] focus:ring-2"
                  style={{ ["--tw-ring-color" as any]: "var(--theme-primary)" }}
                  placeholder="artisan@exemple.fr"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--theme-text)]">
                Mot de passe
              </label>
              <div className="relative">
                <Lock
                  className="absolute left-3 top-3 text-[var(--theme-muted)]"
                  size={18}
                />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] py-3 pl-10 pr-4 text-[var(--theme-text)] outline-none transition-all placeholder:text-[var(--theme-muted)] focus:ring-2"
                  style={{ ["--tw-ring-color" as any]: "var(--theme-primary)" }}
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="group flex w-full items-center justify-center gap-2 rounded-xl py-3 font-bold text-white transition-all disabled:opacity-60"
              style={{ backgroundColor: "var(--theme-primary)" }}
            >
              {isSubmitting ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                <>
                  Se connecter
                  <ArrowRight
                    size={18}
                    className="transition-transform group-hover:translate-x-1"
                  />
                </>
              )}
            </button>
          </form>
        </div>

        <div className="border-t border-[var(--theme-border)] bg-[var(--theme-bg)] p-4 text-center text-[10px] uppercase tracking-widest text-[var(--theme-muted)]">
          Sécurisé par ArtisanPro Cloud
        </div>
      </div>
    </div>
  );
}