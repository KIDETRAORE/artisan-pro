import { useState } from "react";
import { User, Brain, Shield, Database, CreditCard, Save } from "lucide-react";
import { supabase } from "../lib/supabase"; // ✅ AJOUT

export default function Settings() {
  const [autoOpenExpert, setAutoOpenExpert] = useState(true);
  const [defaultModel, setDefaultModel] = useState("gemini-2.5-flash");

  // ✅ AJOUT : handler reset password
  const handleResetPassword = async () => {
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user?.email) {
      // TODO: toast.error("Utilisateur introuvable.");
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      // TODO: toast.error(error.message);
      return;
    }

    // TODO: toast.success("Email envoyé pour réinitialiser le mot de passe.");
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div>
        <h2 className="text-3xl font-extrabold text-slate-900">
          Paramètres
        </h2>
        <p className="text-slate-500 mt-1">
          Configuration de votre espace ArtisanPro
        </p>
      </div>

      {/* Profil */}
      <Section id="account" icon={<User size={18} />} title="Profil">
        <div className="space-y-4">
          <Input label="Nom" placeholder="Votre nom" />
          <Input label="Email" placeholder="email@exemple.com" />
        </div>
      </Section>

      {/* IA */}
      <Section id="ai" icon={<Brain size={18} />} title="Paramètres IA">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">
              Ouvrir automatiquement la bulle Expert après analyse
            </span>
            <input
              type="checkbox"
              checked={autoOpenExpert}
              onChange={() => setAutoOpenExpert(!autoOpenExpert)}
              className="w-5 h-5"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">
              Modèle IA par défaut
            </label>
            <select
              value={defaultModel}
              onChange={(e) => setDefaultModel(e.target.value)}
              className="mt-2 w-full px-4 py-2 rounded-xl bg-slate-100"
            >
              <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
              <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
            </select>
          </div>
        </div>
      </Section>

      {/* Sécurité */}
      <Section id="security" icon={<Shield size={18} />} title="Sécurité">
        {/* ✅ MODIF : bouton avec handler */}
        <button
          onClick={handleResetPassword}
          className="text-blue-600 font-semibold"
        >
          Changer le mot de passe
        </button>
      </Section>

      {/* Données */}
      <Section id="billing" icon={<Database size={18} />} title="Données & exports">
        <button className="text-blue-600 font-semibold">
          Télécharger mes données
        </button>
      </Section>

      {/* Abonnement */}
      <Section id="subscription" icon={<CreditCard size={18} />} title="Abonnement">
        <div className="text-sm text-slate-600">
          Plan actuel : <span className="font-bold text-slate-900">PRO</span>
        </div>
      </Section>

      <div className="pt-4">
        <button className="px-6 py-3 bg-slate-900 text-white rounded-2xl font-bold flex items-center gap-2">
          <Save size={16} />
          Sauvegarder
        </button>
      </div>
    </div>
  );
}

function Section({ id, icon, title, children }: any) {
  return (
    <section
      id={id}
      className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-4 scroll-mt-28"
    >
      <div className="flex items-center gap-3">
        <div className="p-2 bg-slate-100 rounded-xl">{icon}</div>
        <h3 className="font-bold text-slate-900">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function Input({ label, placeholder }: any) {
  return (
    <div>
      <label className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        placeholder={placeholder}
        className="mt-2 w-full px-4 py-2 rounded-xl bg-slate-100"
      />
    </div>
  );
}