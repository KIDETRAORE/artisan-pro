// apps/frontend/src/components/settings/IntegrationsPanel.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Link2,
  Unplug,
  Database,
  Clock3,
  ShieldCheck,
} from "lucide-react";
import { useIntegrationsStore } from "../../store/integrations.store";

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";

  return parsed.toLocaleString("fr-FR");
}

function StatusBadge({
  connected,
  status,
}: {
  connected: boolean;
  status: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wider border ${
        connected
          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
          : "bg-red-50 text-red-700 border-red-200"
      }`}
    >
      {connected ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
      {connected ? status || "connecté" : status || "déconnecté"}
    </span>
  );
}

function EventList({
  events,
}: {
  events: Array<{
    id: string;
    status: string;
    message: string | null;
    created_at: string;
  }>;
}) {
  if (events.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-3 text-sm text-[var(--theme-muted)]">
        Aucun événement récent.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {events.map((event) => {
        const isSuccess = String(event.status).toLowerCase() === "success";

        return (
          <div
            key={event.id}
            className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-3"
          >
            <div className="flex items-center justify-between gap-3">
              <div
                className={`text-[10px] font-black uppercase tracking-[0.2em] ${
                  isSuccess ? "text-emerald-600" : "text-red-600"
                }`}
              >
                {event.status}
              </div>
              <div className="text-xs text-[var(--theme-muted)]">
                {formatDateTime(event.created_at)}
              </div>
            </div>
            <div className="mt-1 text-sm text-[var(--theme-text)]">
              {event.message?.trim() || "Aucun message."}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LastSyncSummary({
  events,
  syncing,
}: {
  events: Array<{
    id: string;
    status: string;
    message: string | null;
    created_at: string;
  }>;
  syncing: boolean;
}) {
  const latestEvent = events.length > 0 ? events[0] : null;
  const isSuccess =
    String(latestEvent?.status ?? "").toLowerCase() === "success";

  return (
    <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.2em] text-[var(--theme-muted)]">
            Dernière synchronisation
          </div>
          <div className="mt-1 text-sm font-bold text-[var(--theme-text)]">
            {syncing
              ? "Synchronisation en cours..."
              : latestEvent
                ? formatDateTime(latestEvent.created_at)
                : "Aucune synchronisation enregistrée"}
          </div>
        </div>

        <div
          className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] border ${
            syncing
              ? "border-blue-200 bg-blue-50 text-blue-700"
              : latestEvent
                ? isSuccess
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-red-200 bg-red-50 text-red-700"
                : "border-[var(--theme-border)] bg-[var(--theme-card)] text-[var(--theme-muted)]"
          }`}
        >
          {syncing
            ? "En cours"
            : latestEvent
              ? latestEvent.status
              : "Aucun événement"}
        </div>
      </div>

      {latestEvent?.message ? (
        <div className="mt-2 text-sm text-[var(--theme-muted)]">
          {latestEvent.message}
        </div>
      ) : null}
    </div>
  );
}

function ProviderCard({
  title,
  subtitle,
  connected,
  status,
  connectedAt,
  usesWorkspaceKey,
  loading,
  syncing,
  connecting,
  disconnecting,
  error,
  onRefresh,
  onSync,
  onConnect,
  onDisconnect,
  children,
}: {
  title: string;
  subtitle: string;
  connected: boolean;
  status: string;
  connectedAt: string | null | undefined;
  usesWorkspaceKey: boolean | undefined;
  loading: boolean;
  syncing: boolean;
  connecting: boolean;
  disconnecting: boolean;
  error: string | null;
  onRefresh: () => void;
  onSync: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Database size={18} className="text-[var(--theme-text)]" />
            <h3 className="text-lg font-black text-[var(--theme-text)]">
              {title}
            </h3>
          </div>

          <p className="mt-1 text-sm text-[var(--theme-muted)]">{subtitle}</p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <StatusBadge connected={connected} status={status} />

            <span className="inline-flex items-center gap-2 text-xs text-[var(--theme-muted)]">
              <Clock3 size={12} />
              Connecté le : {formatDateTime(connectedAt)}
            </span>

            {usesWorkspaceKey ? (
              <span className="inline-flex items-center gap-2 text-xs font-bold text-indigo-600">
                <ShieldCheck size={12} />
                Clé workspace
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-4 py-3 text-sm font-bold text-[var(--theme-text)] transition-colors hover:bg-[var(--theme-bg)] disabled:opacity-60"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            Actualiser
          </button>

          <button
            type="button"
            onClick={onSync}
            disabled={syncing || !connected}
            className="inline-flex items-center gap-2 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-4 py-3 text-sm font-bold text-[var(--theme-text)] transition-colors hover:bg-[var(--theme-bg)] disabled:opacity-60"
          >
            <RefreshCw size={15} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Sync..." : "Sync manuelle"}
          </button>

          {connected ? (
            <button
              type="button"
              onClick={onDisconnect}
              disabled={disconnecting}
              className="inline-flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-60"
            >
              <Unplug size={15} />
              {disconnecting ? "Déconnexion..." : "Déconnecter"}
            </button>
          ) : (
            <button
              type="button"
              onClick={onConnect}
              disabled={connecting}
              className="inline-flex items-center gap-2 rounded-2xl bg-[var(--theme-primary)] px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-600 disabled:opacity-60"
            >
              <Link2 size={15} />
              {connecting ? "Connexion..." : "Connecter"}
            </button>
          )}
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="mt-6">{children}</div>
    </div>
  );
}

export default function IntegrationsPanel() {
  const {
    pennylane,
    odoo,
    loadPennylaneStatus,
    connectPennylane,
    disconnectPennylane,
    syncPennylane,
    loadOdooStatus,
    connectOdoo,
    disconnectOdoo,
    syncOdoo,
  } = useIntegrationsStore();

  const [pennylaneApiKey, setPennylaneApiKey] = useState("");
  const [odooBaseUrl, setOdooBaseUrl] = useState("");
  const [odooDatabase, setOdooDatabase] = useState("");
  const [odooLogin, setOdooLogin] = useState("");
  const [odooApiKey, setOdooApiKey] = useState("");

  useEffect(() => {
    void loadPennylaneStatus();
    void loadOdooStatus();
  }, [loadPennylaneStatus, loadOdooStatus]);

  const pennylaneConnected = useMemo(
    () => Boolean(pennylane.connection?.connected),
    [pennylane.connection]
  );

  const odooConnected = useMemo(
    () => Boolean(odoo.connection?.connected),
    [odoo.connection]
  );

  const handleConnectPennylane = async () => {
    if (!pennylaneApiKey.trim()) return;
    await connectPennylane(pennylaneApiKey.trim());
    setPennylaneApiKey("");
  };

  const handleDisconnectPennylane = async () => {
    await disconnectPennylane();
  };

  const handleSyncPennylane = async () => {
    await syncPennylane();
  };

  const handleConnectOdoo = async () => {
    if (
      !odooBaseUrl.trim() ||
      !odooDatabase.trim() ||
      !odooLogin.trim() ||
      !odooApiKey.trim()
    ) {
      return;
    }

    await connectOdoo({
      baseUrl: odooBaseUrl.trim(),
      database: odooDatabase.trim(),
      login: odooLogin.trim(),
      apiKey: odooApiKey.trim(),
    });

    setOdooBaseUrl("");
    setOdooDatabase("");
    setOdooLogin("");
    setOdooApiKey("");
  };

  const handleDisconnectOdoo = async () => {
    await disconnectOdoo();
  };

  const handleSyncOdoo = async () => {
    await syncOdoo();
  };

  return (
    <div className="space-y-6">
      <ProviderCard
        title="Pennylane"
        subtitle="Connexion API Pennylane, synchronisation des factures et suivi des événements."
        connected={pennylaneConnected}
        status={pennylane.connection?.status ?? "disconnected"}
        connectedAt={pennylane.connection?.connectedAt}
        usesWorkspaceKey={pennylane.connection?.usesWorkspaceKey}
        loading={pennylane.loading}
        syncing={pennylane.syncing}
        connecting={pennylane.connecting}
        disconnecting={pennylane.disconnecting}
        error={pennylane.error}
        onRefresh={() => {
          void loadPennylaneStatus();
        }}
        onSync={() => {
          void handleSyncPennylane();
        }}
        onConnect={() => {
          void handleConnectPennylane();
        }}
        onDisconnect={() => {
          void handleDisconnectPennylane();
        }}
      >
        {!pennylaneConnected ? (
          <div className="space-y-3">
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-[var(--theme-text)]">
                API Key Pennylane
              </span>
              <input
                type="password"
                value={pennylaneApiKey}
                onChange={(e) => setPennylaneApiKey(e.target.value)}
                placeholder="pl_..."
                className="w-full rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-3 text-sm text-[var(--theme-text)] outline-none focus:border-blue-400"
              />
            </label>
          </div>
        ) : null}

        <div className="mt-6 space-y-4">
          <LastSyncSummary
            events={pennylane.recentEvents}
            syncing={pennylane.syncing}
          />

          <div>
            <h4 className="mb-3 text-sm font-black uppercase tracking-wider text-[var(--theme-text)]">
              Événements récents
            </h4>
            <EventList events={pennylane.recentEvents} />
          </div>
        </div>
      </ProviderCard>

      <ProviderCard
        title="Odoo"
        subtitle="Connexion Odoo JSON-2 / API externe pour synchroniser les factures et les événements."
        connected={odooConnected}
        status={odoo.connection?.status ?? "disconnected"}
        connectedAt={odoo.connection?.connectedAt}
        usesWorkspaceKey={odoo.connection?.usesWorkspaceKey}
        loading={odoo.loading}
        syncing={odoo.syncing}
        connecting={odoo.connecting}
        disconnecting={odoo.disconnecting}
        error={odoo.error}
        onRefresh={() => {
          void loadOdooStatus();
        }}
        onSync={() => {
          void handleSyncOdoo();
        }}
        onConnect={() => {
          void handleConnectOdoo();
        }}
        onDisconnect={() => {
          void handleDisconnectOdoo();
        }}
      >
        {!odooConnected ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-[var(--theme-text)]">
                Base URL
              </span>
              <input
                type="text"
                value={odooBaseUrl}
                onChange={(e) => setOdooBaseUrl(e.target.value)}
                placeholder="https://mon-odoo.com"
                className="w-full rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-3 text-sm text-[var(--theme-text)] outline-none focus:border-blue-400"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-bold text-[var(--theme-text)]">
                Database
              </span>
              <input
                type="text"
                value={odooDatabase}
                onChange={(e) => setOdooDatabase(e.target.value)}
                placeholder="odoo-db"
                className="w-full rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-3 text-sm text-[var(--theme-text)] outline-none focus:border-blue-400"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-bold text-[var(--theme-text)]">
                Login
              </span>
              <input
                type="text"
                value={odooLogin}
                onChange={(e) => setOdooLogin(e.target.value)}
                placeholder="admin@example.com"
                className="w-full rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-3 text-sm text-[var(--theme-text)] outline-none focus:border-blue-400"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-bold text-[var(--theme-text)]">
                API Key
              </span>
              <input
                type="password"
                value={odooApiKey}
                onChange={(e) => setOdooApiKey(e.target.value)}
                placeholder="odoo_api_key"
                className="w-full rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-3 text-sm text-[var(--theme-text)] outline-none focus:border-blue-400"
              />
            </label>
          </div>
        ) : null}

        <div className="mt-6 space-y-4">
          <LastSyncSummary events={odoo.recentEvents} syncing={odoo.syncing} />

          <div>
            <h4 className="mb-3 text-sm font-black uppercase tracking-wider text-[var(--theme-text)]">
              Événements récents
            </h4>
            <EventList events={odoo.recentEvents} />
          </div>
        </div>
      </ProviderCard>
    </div>
  );
}