// apps/frontend/src/pages/Settings.tsx
import { useEffect, useMemo, useState } from "react";
import {
  User,
  Brain,
  Shield,
  Database,
  CreditCard,
  Save,
  Link2,
  RefreshCw,
  PlugZap,
  Unplug,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import {
  connectPennylane,
  disconnectPennylane,
  getPennylaneStatus,
  type PennylaneConnection,
  type PennylaneSyncEvent,
} from "../services/integrations.api";

export default function Settings() {
  const [autoOpenExpert, setAutoOpenExpert] = useState(true);
  const [defaultModel, setDefaultModel] = useState("gemini-2.5-flash");

  const [pennylaneApiKey, setPennylaneApiKey] = useState("");
  const [pennylaneConnection, setPennylaneConnection] =
    useState<PennylaneConnection | null>(null);
  const [recentPennylaneEvents, setRecentPennylaneEvents] = useState<
    PennylaneSyncEvent[]
  >([]);
  const [integrationLoading, setIntegrationLoading] = useState(false);
  const [integrationMessage, setIntegrationMessage] = useState<string | null>(
    null
  );
  const [integrationError, setIntegrationError] = useState<string | null>(null);

  const loadPennylane = async () => {
    setIntegrationLoading(true);
    setIntegrationError(null);

    try {
      const data = await getPennylaneStatus(8);
      setPennylaneConnection(data.connection);
      setRecentPennylaneEvents(data.recentEvents ?? []);
    } catch {
      setIntegrationError("Impossible de charger le statut Pennylane.");
    } finally {
      setIntegrationLoading(false);
    }
  };

  useEffect(() => {
    void loadPennylane();
  }, []);

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

  const handleConnectPennylane = async () => {
    const trimmed = pennylaneApiKey.trim();

    if (!trimmed) {
      setIntegrationError(
        "Renseigne une clé API Pennylane avant de connecter."
      );
      return;
    }

    setIntegrationLoading(true);
    setIntegrationError(null);
    setIntegrationMessage(null);

    try {
      const connection = await connectPennylane(trimmed);
      setPennylaneConnection(connection);
      setPennylaneApiKey("");
      setIntegrationMessage("Pennylane connecté avec succès.");

      const data = await getPennylaneStatus(8);
      setRecentPennylaneEvents(data.recentEvents ?? []);
    } catch {
      setIntegrationError("Impossible d’enregistrer la connexion Pennylane.");
    } finally {
      setIntegrationLoading(false);
    }
  };

  const handleDisconnectPennylane = async () => {
    setIntegrationLoading(true);
    setIntegrationError(null);
    setIntegrationMessage(null);

    try {
      await disconnectPennylane();
      setPennylaneConnection({
        provider: "pennylane",
        connected: false,
        status: "disconnected",
        connectedAt: null,
        hasCredential: false,
        usesWorkspaceKey: false,
      });
      setRecentPennylaneEvents([]);
      setIntegrationMessage("Pennylane a été déconnecté.");
    } catch {
      setIntegrationError("Impossible de déconnecter Pennylane.");
    } finally {
      setIntegrationLoading(false);
    }
  };

  const pennylaneStatusLabel = useMemo(() => {
    if (!pennylaneConnection) return "Chargement";
    if (
      pennylaneConnection.usesWorkspaceKey &&
      !pennylaneConnection.hasCredential
    ) {
      return "Clé workspace";
    }
    if (pennylaneConnection.connected) {
      return "Connecté";
    }
    return "Non connecté";
  }, [pennylaneConnection]);

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div>
        <h2 className="text-3xl font-extrabold text-slate-900">Paramètres</h2>
        <p className="text-slate-500 mt-1">
          Configuration de votre espace ArtisanPro
        </p>
      </div>

      <Section id="account" icon={<User size={18} />} title="Profil">
        <div className="space-y-4">
          <Input label="Nom" placeholder="Votre nom" />
          <Input label="Email" placeholder="email@exemple.com" />
        </div>
      </Section>

      <Section id="ai" icon={<Brain size={18} />} title="Paramètres IA">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
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

      <Section
        id="integrations"
        icon={<Link2 size={18} />}
        title="Intégrations comptables"
      >
        <div className="space-y-5">
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                {pennylaneConnection?.connected ? (
                  <CheckCircle2 size={16} className="text-emerald-600" />
                ) : (
                  <AlertTriangle size={16} className="text-amber-500" />
                )}
                Pennylane · {pennylaneStatusLabel}
              </div>

              <div className="mt-1 text-xs font-medium text-slate-500">
                {pennylaneConnection?.connected
                  ? "Les factures finalisées peuvent être synchronisées vers Pennylane."
                  : "Ajoute une clé API Pennylane pour activer la synchronisation comptable."}
              </div>

              {pennylaneConnection?.connectedAt ? (
                <div className="mt-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                  Connecté le{" "}
                  {new Date(pennylaneConnection.connectedAt).toLocaleString(
                    "fr-FR"
                  )}
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => void loadPennylane()}
              disabled={integrationLoading}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
            >
              <RefreshCw
                size={16}
                className={integrationLoading ? "animate-spin" : ""}
              />
              Actualiser
            </button>
          </div>

          {integrationError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {integrationError}
            </div>
          ) : null}

          {integrationMessage ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
              {integrationMessage}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto_auto] md:items-end">
            <div>
              <label className="text-sm font-medium text-slate-700">
                Clé API Pennylane
              </label>
              <input
                type="password"
                value={pennylaneApiKey}
                onChange={(e) => setPennylaneApiKey(e.target.value)}
                placeholder="pl_xxxxxxxxxxxxxxxxx"
                className="mt-2 w-full rounded-xl bg-slate-100 px-4 py-2 text-sm text-slate-900"
              />
              <div className="mt-2 text-xs text-slate-500">
                La clé est stockée côté backend dans les tables d’intégration
                déjà présentes.
              </div>
            </div>

            <button
              type="button"
              onClick={handleConnectPennylane}
              disabled={integrationLoading}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white hover:bg-blue-600 disabled:opacity-60"
            >
              <PlugZap size={16} />
              {pennylaneConnection?.hasCredential
                ? "Mettre à jour"
                : "Connecter"}
            </button>

            <button
              type="button"
              onClick={handleDisconnectPennylane}
              disabled={integrationLoading || !pennylaneConnection?.hasCredential}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              <Unplug size={16} />
              Déconnecter
            </button>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-4">
            <div className="mb-3 text-sm font-bold text-slate-900">
              Derniers événements de synchronisation
            </div>

            {recentPennylaneEvents.length === 0 ? (
              <div className="text-sm text-slate-500">
                Aucun événement Pennylane pour le moment.
              </div>
            ) : (
              <div className="space-y-3">
                {recentPennylaneEvents.map((event) => (
                  <div
                    key={event.id}
                    className="flex flex-col gap-2 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <div className="text-sm font-bold text-slate-900">
                        {event.message || "Synchronisation Pennylane"}
                      </div>
                      <div className="mt-1 text-xs font-medium text-slate-500">
                        {event.object_type || "objet"}
                        {event.object_id ? ` · ${event.object_id}` : ""}
                      </div>
                    </div>

                    <div className="text-right">
                      <div
                        className={`text-xs font-black uppercase tracking-widest ${
                          event.status === "success"
                            ? "text-emerald-600"
                            : "text-red-600"
                        }`}
                      >
                        {event.status}
                      </div>
                      <div className="mt-1 text-[11px] font-medium text-slate-500">
                        {new Date(event.created_at).toLocaleString("fr-FR")}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Section>

      <Section id="security" icon={<Shield size={18} />} title="Sécurité">
        <button
          onClick={handleResetPassword}
          className="text-blue-600 font-semibold"
        >
          Changer le mot de passe
        </button>
      </Section>

      <Section
        id="billing"
        icon={<Database size={18} />}
        title="Données & exports"
      >
        <button className="text-blue-600 font-semibold">
          Télécharger mes données
        </button>
      </Section>

      <Section
        id="subscription"
        icon={<CreditCard size={18} />}
        title="Abonnement"
      >
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

function Input({
  label,
  placeholder,
}: {
  label: string;
  placeholder: string;
}) {
  return (
    <div>
      <label className="text-sm font-medium text-slate-700">{label}</label>
      <input
        placeholder={placeholder}
        className="mt-2 w-full px-4 py-2 rounded-xl bg-slate-100"
      />
    </div>
  );
}