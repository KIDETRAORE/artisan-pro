// apps/frontend/src/pages/Settings.tsx
import { useState } from "react";
import {
  User,
  Brain,
  Shield,
  Database,
  CreditCard,
  Save,
  Link2,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import IntegrationsPanel from "../components/settings/IntegrationsPanel";

export default function Settings() {
  const [autoOpenExpert, setAutoOpenExpert] = useState(true);
  const [defaultModel, setDefaultModel] = useState("gemini-2.5-flash");

  const handleResetPassword = async () => {
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user?.email) {
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      return;
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8 animate-in fade-in duration-500">
      <div>
        <h2 className="text-3xl font-extrabold text-[var(--theme-text)]">
          Compte
        </h2>
        <p className="mt-1 text-[var(--theme-muted)]">
          Gérez votre profil, vos intégrations et votre abonnement ArtisanPro.
        </p>
      </div>

      <Section id="account" icon={<User size={18} />} title="Profil">
        <div className="space-y-4">
          <Input label="Nom" placeholder="Votre nom" />
          <Input label="Email" placeholder="email@exemple.com" />
        </div>
      </Section>

      <Section id="ai" icon={<Brain size={18} />} title="Configuration IA">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium text-[var(--theme-text)]">
              Ouvrir automatiquement la bulle Expert après analyse
            </span>
            <input
              type="checkbox"
              checked={autoOpenExpert}
              onChange={() => setAutoOpenExpert(!autoOpenExpert)}
              className="h-5 w-5"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-[var(--theme-text)]">
              Modèle IA par défaut
            </label>
            <select
              value={defaultModel}
              onChange={(e) => setDefaultModel(e.target.value)}
              className="mt-2 w-full rounded-xl bg-[var(--theme-bg)] px-4 py-2 text-[var(--theme-text)]"
            >
              <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
              <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
            </select>
          </div>
        </div>
      </Section>

      <Section
        id="integrations"
        icon={<Link2 size={18} />}
        title="Intégrations comptables"
      >
        <IntegrationsPanel />
      </Section>

      <Section id="security" icon={<Shield size={18} />} title="Sécurité">
        <button
          onClick={handleResetPassword}
          className="font-semibold text-[var(--theme-primary)]"
        >
          Changer le mot de passe
        </button>
      </Section>

      <Section
        id="billing"
        icon={<Database size={18} />}
        title="Données & exports"
      >
        <button className="font-semibold text-[var(--theme-primary)]">
          Télécharger mes données
        </button>
      </Section>

      <Section
        id="subscription"
        icon={<CreditCard size={18} />}
        title="Abonnement"
      >
        <div className="text-sm text-[var(--theme-muted)]">
          Plan actuel :{" "}
          <span className="font-bold text-[var(--theme-text)]">PRO</span>
        </div>
      </Section>

      <div className="pt-4">
        <button className="flex items-center gap-2 rounded-2xl bg-[var(--theme-primary)] px-6 py-3 font-bold text-white">
          <Save size={16} />
          Sauvegarder
        </button>
      </div>
    </div>
  );
}

function Section({
  id,
  icon,
  title,
  children,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-28 space-y-4 rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-6 shadow-sm"
    >
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-[var(--theme-bg)] p-2">{icon}</div>
        <h3 className="font-bold text-[var(--theme-text)]">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function Input({
  label,
  placeholder,
}: {
  label: string;
  placeholder: string;
}) {
  return (
    <div>
      <label className="text-sm font-medium text-[var(--theme-text)]">
        {label}
      </label>
      <input
        placeholder={placeholder}
        className="mt-2 w-full rounded-xl bg-[var(--theme-bg)] px-4 py-2 text-[var(--theme-text)]"
      />
    </div>
  );
}