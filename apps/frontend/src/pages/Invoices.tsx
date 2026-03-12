// apps/frontend/src/pages/Invoices.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Search,
  FileCheck,
  Send,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Filter,
  TrendingUp,
  ReceiptEuro,
  Sparkles,
  ListChecks,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Receipt,
  Wallet,
  Building2,
} from "lucide-react";
import {
  deleteInvoice,
  listInvoices,
  moneyCentsFromInvoice,
  sendInvoiceReminder,
  type Invoice,
} from "../services/invoices.api";
import { useComptaReportStore } from "../store/comptaReport.store";
import type { ComptaReport } from "../schemas/comptaReport.schema";

interface FactureItem {
  id: string;
  client: string;
  echeance: string;
  montant: string;
  statut: "PAYÉ" | "RETARD" | "ATTENTE";
  nbRelances: number;
  source: "compta" | "invoice";
  invoiceId?: string;
  referenceNormalized: string;
  clientNormalized: string;
  dateIso: string | null;
  amountCents: number;
  canSendReminder: boolean;
}

function formatMoney(value: number | undefined): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";

  try {
    return new Date(value).toLocaleDateString("fr-FR");
  } catch {
    return value;
  }
}

function toIsoDate(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) {
    return raw.slice(0, 10);
  }

  const frMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (frMatch) {
    const [, dd, mm, yyyy] = frMatch;
    return `${yyyy}-${mm}-${dd}`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

function mapInvoiceStatus(
  status: string | null | undefined
): FactureItem["statut"] {
  const normalized = String(status ?? "").toLowerCase();

  if (normalized === "paid") return "PAYÉ";
  if (normalized === "overdue") return "RETARD";
  return "ATTENTE";
}

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeReference(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function parseNumericValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value
      .replace(/\s/g, "")
      .replace(",", ".")
      .replace(/[^\d.-]/g, "");
    const parsed = Number(normalized);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function findColumnIndex(headers: string[], candidates: string[]): number {
  return headers.findIndex((header) =>
    candidates.some((candidate) => header.includes(candidate))
  );
}

function inferComptaStatus(
  value: unknown
): Exclude<FactureItem["statut"], "ATTENTE"> | null {
  const normalized = normalizeText(value);

  if (!normalized) {
    return null;
  }

  if (
    normalized.includes("pay") ||
    normalized.includes("paye") ||
    normalized.includes("regl") ||
    normalized.includes("regle") ||
    normalized.includes("reglee") ||
    normalized.includes("encaiss") ||
    normalized.includes("solde") ||
    normalized.includes("sold")
  ) {
    return "PAYÉ";
  }

  if (
    normalized.includes("retard") ||
    normalized.includes("impaye") ||
    normalized.includes("overdue") ||
    normalized.includes("echeance depassee") ||
    normalized.includes("a relancer") ||
    normalized.includes("relance")
  ) {
    return "RETARD";
  }

  return null;
}

function isDateLike(value: unknown): boolean {
  const raw = String(value ?? "").trim();
  if (!raw) return false;

  return (
    /^\d{2}\/\d{2}\/\d{4}$/.test(raw) ||
    /^\d{4}-\d{2}-\d{2}/.test(raw) ||
    !Number.isNaN(Date.parse(raw))
  );
}

function isReferenceLike(value: unknown): boolean {
  const raw = String(value ?? "").trim();
  if (!raw) return false;

  return /^(fac|inv|facture|invoice|piece|doc)[-_/#\s]?\w+/i.test(raw);
}

function isPastDue(value: string | null | undefined): boolean {
  const iso = toIsoDate(value);
  if (!iso) return false;

  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return false;

  const now = new Date();
  parsed.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);

  return parsed < now;
}

function pickBestClient(row: unknown[]): string {
  for (const cell of row) {
    const value = String(cell ?? "").trim();
    if (!value) continue;
    if (isDateLike(value)) continue;
    if (isReferenceLike(value)) continue;
    if (parseNumericValue(value) !== 0) continue;
    if (value.length < 3) continue;
    return value;
  }

  return "";
}

function pickBestDate(row: unknown[]): string {
  for (const cell of row) {
    if (isDateLike(cell)) {
      return String(cell);
    }
  }

  return "";
}

function pickBestAmount(row: unknown[]): number {
  const values = row
    .map((cell) => parseNumericValue(cell))
    .filter((value) => value !== 0);

  if (values.length === 0) return 0;

  return values[values.length - 1] ?? 0;
}

function pickBestReference(
  row: unknown[],
  fallback: string,
  preferredIndex: number
): string {
  if (preferredIndex >= 0) {
    const direct = String(row?.[preferredIndex] ?? "").trim();
    if (direct) return direct;
  }

  for (const cell of row) {
    if (isReferenceLike(cell)) {
      return String(cell).trim();
    }
  }

  return fallback;
}

function findStatusInRow(
  row: unknown[]
): Exclude<FactureItem["statut"], "ATTENTE"> | null {
  for (const cell of row) {
    const raw = String(cell ?? "").trim();
    if (!raw) continue;

    const status = inferComptaStatus(raw);
    if (status) {
      return status;
    }
  }

  return null;
}

function rowHasRetardAnomaly(
  report: ComptaReport,
  client: string,
  id: string
): boolean {
  const normalizedClient = normalizeText(client);
  const normalizedId = normalizeText(id);

  return (report.anomalies ?? []).some((anomaly) => {
    const message = normalizeText(anomaly.message);

    const mentionsClient =
      normalizedClient.length > 0 && message.includes(normalizedClient);
    const mentionsId = normalizedId.length > 0 && message.includes(normalizedId);
    const mentionsRetard =
      message.includes("retard") ||
      message.includes("impaye") ||
      message.includes("echeance depassee") ||
      message.includes("echeance dépassée") ||
      message.includes("relance");

    return mentionsRetard && (mentionsClient || mentionsId);
  });
}

function hasPaymentEvidence(row: unknown[]): boolean {
  return row.some((cell) => {
    const value = normalizeText(cell);

    return (
      value.includes("cb") ||
      value.includes("carte") ||
      value.includes("virement") ||
      value.includes("cheque") ||
      value.includes("espèces") ||
      value.includes("especes") ||
      value.includes("paypal") ||
      value.includes("regle") ||
      value.includes("reglee") ||
      value.includes("paye") ||
      value.includes("encaiss")
    );
  });
}

function resolveComptaStatus(params: {
  report: ComptaReport;
  row: unknown[];
  directStatus: Exclude<FactureItem["statut"], "ATTENTE"> | null;
  client: string;
  id: string;
  dateIso: string | null;
  amount: number;
}): FactureItem["statut"] {
  const { report, row, directStatus, client, id, dateIso, amount } = params;

  if (directStatus) {
    return directStatus;
  }

  const rowStatus = findStatusInRow(row);
  if (rowStatus) {
    return rowStatus;
  }

  if (rowHasRetardAnomaly(report, client, id)) {
    return "RETARD";
  }

  if (hasPaymentEvidence(row)) {
    return "PAYÉ";
  }

  if (dateIso && isPastDue(dateIso) && amount > 0) {
    return "RETARD";
  }

  return "ATTENTE";
}

function buildComptaFactures(report: ComptaReport | null): FactureItem[] {
  if (!report) return [];

  const table = report.data?.sheets?.livre_recettes;
  if (!table) return [];

  const items: FactureItem[] = [];
  const headers = table.columns.map(normalizeHeader);

  const idIndex = findColumnIndex(headers, [
    "reference",
    "numero",
    "numfacture",
    "invoice",
    "piece",
    "id",
    "document",
    "facture",
  ]);
  const clientIndex = findColumnIndex(headers, [
    "client",
    "nomclient",
    "customer",
    "tiers",
    "libelle",
    "label",
    "description",
    "intitule",
    "designation",
    "raisonsociale",
  ]);
  const dateIndex = findColumnIndex(headers, [
    "echeance",
    "duedate",
    "date",
    "datefacture",
    "datepiece",
    "dateoperation",
    "dateemission",
  ]);
  const amountIndex = findColumnIndex(headers, [
    "montantttc",
    "totalttc",
    "montant",
    "total",
    "amount",
    "debit",
    "credit",
    "netapayer",
    "solde",
    "reste",
    "ttc",
    "ht",
  ]);
  const statusIndex = findColumnIndex(headers, [
    "statut",
    "status",
    "etat",
    "reglement",
    "paiement",
    "modepaiement",
    "datepaiement",
  ]);

  table.rows.forEach((row, index) => {
    const fallbackId = `livre_recettes-${index + 1}`;

    const directClient =
      clientIndex >= 0 ? String(row?.[clientIndex] ?? "").trim() : "";
    const directDate =
      dateIndex >= 0 ? String(row?.[dateIndex] ?? "").trim() : "";
    const directAmount =
      amountIndex >= 0 ? parseNumericValue(row?.[amountIndex]) : 0;
    const directStatus =
      statusIndex >= 0 ? inferComptaStatus(row?.[statusIndex]) : null;

    const client = directClient || pickBestClient(row);
    const dateRaw = directDate || pickBestDate(row);
    const dateIso = toIsoDate(dateRaw);
    const amount = directAmount !== 0 ? directAmount : pickBestAmount(row);
    const id = pickBestReference(row, fallbackId, idIndex);

    if (!client && !dateIso && amount === 0) return;

    const statut = resolveComptaStatus({
      report,
      row,
      directStatus,
      client,
      id,
      dateIso,
      amount,
    });

    const amountCents = Math.round(amount * 100);

    items.push({
      id,
      client: client || `Ligne ${index + 1}`,
      echeance: dateIso ? formatDate(dateIso) : "—",
      montant: formatMoney(amount),
      statut,
      nbRelances: 0,
      source: "compta",
      referenceNormalized: normalizeReference(id),
      clientNormalized: normalizeText(client || `Ligne ${index + 1}`),
      dateIso,
      amountCents,
      canSendReminder: false,
    });
  });

  return items;
}

function dedupeFactures(params: {
  comptaFactures: FactureItem[];
  realFactures: FactureItem[];
}): FactureItem[] {
  const { comptaFactures, realFactures } = params;

  const referenceSet = new Set(
    realFactures
      .map((item) => item.referenceNormalized)
      .filter((value) => value.length > 0)
  );

  const signatureSet = new Set(
    realFactures
      .filter(
        (item) =>
          item.clientNormalized.length > 0 &&
          item.dateIso &&
          item.amountCents > 0
      )
      .map(
        (item) => `${item.clientNormalized}__${item.dateIso}__${item.amountCents}`
      )
  );

  const filteredCompta = comptaFactures.filter((item) => {
    if (item.referenceNormalized && referenceSet.has(item.referenceNormalized)) {
      return false;
    }

    if (
      item.clientNormalized &&
      item.dateIso &&
      item.amountCents > 0 &&
      signatureSet.has(
        `${item.clientNormalized}__${item.dateIso}__${item.amountCents}`
      )
    ) {
      return false;
    }

    return true;
  });

  return [...realFactures, ...filteredCompta];
}

const FULL_LIST_PAGE_SIZE = 50;

const CANONICAL_ACTIONS = [
  {
    title: "Factures clients",
    description: "Base canonique des ventes clients.",
    to: "/sales-invoices",
    icon: Receipt,
  },
  {
    title: "Factures fournisseurs",
    description: "Base canonique des achats fournisseurs.",
    to: "/purchase-bills",
    icon: Building2,
  },
  {
    title: "Paiements",
    description: "Encaissements et décaissements.",
    to: "/payments",
    icon: Wallet,
  },
];

export default function Invoices() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const report = useComptaReportStore((s) => s.report);

  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [remindingInvoiceId, setRemindingInvoiceId] = useState<string | null>(
    null
  );
  const [realInvoices, setRealInvoices] = useState<Invoice[]>([]);
  const [hiddenComptaIds, setHiddenComptaIds] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);

  const isFullListView = searchParams.get("view") === "all";

  const loadInvoices = useCallback(async () => {
    try {
      const data = await listInvoices();
      setRealInvoices(Array.isArray(data) ? data : []);
    } catch {
      setRealInvoices([]);
    }
  }, []);

  useEffect(() => {
    void loadInvoices();
  }, [loadInvoices]);

  useEffect(() => {
    const handleWindowFocus = () => {
      void loadInvoices();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void loadInvoices();
      }
    };

    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loadInvoices]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, isFullListView]);

  const comptaFactures = useMemo(() => {
    return buildComptaFactures(report).filter(
      (item) => !hiddenComptaIds.includes(item.id)
    );
  }, [report, hiddenComptaIds]);

  const realFactures = useMemo<FactureItem[]>(() => {
    return realInvoices.map((invoice) => {
      const dueDateIso = toIsoDate(invoice.due_date);
      const amountCents = moneyCentsFromInvoice(invoice);

      return {
        id: String(invoice.invoice_number ?? invoice.id ?? ""),
        client: invoice.client_name || "Client",
        echeance: formatDate(invoice.due_date),
        montant: formatMoney(amountCents / 100),
        statut: mapInvoiceStatus(invoice.status),
        nbRelances: Number(invoice.reminder_count ?? 0),
        source: "invoice",
        invoiceId: invoice.id,
        referenceNormalized: normalizeReference(
          invoice.invoice_number ?? invoice.id ?? ""
        ),
        clientNormalized: normalizeText(invoice.client_name || "Client"),
        dateIso: dueDateIso,
        amountCents,
        canSendReminder:
          mapInvoiceStatus(invoice.status) === "RETARD" && Boolean(invoice.id),
      };
    });
  }, [realInvoices]);

  const mergedFactures = useMemo(() => {
    return dedupeFactures({
      comptaFactures,
      realFactures,
    });
  }, [comptaFactures, realFactures]);

  const filteredFactures = useMemo(() => {
    const needle = searchTerm.toLowerCase();

    return mergedFactures.filter(
      (item) =>
        item.client.toLowerCase().includes(needle) ||
        item.id.toLowerCase().includes(needle)
    );
  }, [mergedFactures, searchTerm]);

  const totalPages = useMemo(() => {
    if (!isFullListView) return 1;
    return Math.max(1, Math.ceil(filteredFactures.length / FULL_LIST_PAGE_SIZE));
  }, [filteredFactures.length, isFullListView]);

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const displayedFactures = useMemo(() => {
    if (!isFullListView) {
      return filteredFactures.slice(0, 5);
    }

    const startIndex = (currentPage - 1) * FULL_LIST_PAGE_SIZE;
    return filteredFactures.slice(
      startIndex,
      startIndex + FULL_LIST_PAGE_SIZE
    );
  }, [filteredFactures, isFullListView, currentPage]);

  const currentRangeLabel = useMemo(() => {
    if (!isFullListView || filteredFactures.length === 0) {
      return null;
    }

    const start = (currentPage - 1) * FULL_LIST_PAGE_SIZE + 1;
    const end = Math.min(
      currentPage * FULL_LIST_PAGE_SIZE,
      filteredFactures.length
    );

    return `${start}-${end} / ${filteredFactures.length}`;
  }, [currentPage, filteredFactures.length, isFullListView]);

  const invoiceInsight = useMemo(() => {
    if (report?.summary?.resume) {
      return report.summary.resume;
    }

    const overdue = mergedFactures.filter((item) => item.statut === "RETARD");
    const pending = mergedFactures.filter((item) => item.statut === "ATTENTE");
    const paid = mergedFactures.filter((item) => item.statut === "PAYÉ");

    return `${overdue.length} facture${
      overdue.length > 1 ? "s" : ""
    } en retard, ${pending.length} en attente et ${paid.length} encaissée${
      paid.length > 1 ? "s" : ""
    }. Les relances doivent se concentrer sur les dossiers déjà échus.`;
  }, [mergedFactures, report]);

  const attentionPoints = useMemo(() => {
    if (report?.anomalies?.length) {
      return report.anomalies.map((item) => item.message);
    }

    return mergedFactures
      .filter((item) => item.statut === "RETARD")
      .map(
        (item) =>
          `${item.client} • ${item.montant} • ${item.nbRelances} relance${
            item.nbRelances > 1 ? "s" : ""
          } déjà envoyée${item.nbRelances > 1 ? "s" : ""}.`
      );
  }, [mergedFactures, report]);

  const recommendedActions = useMemo(() => {
    if (report?.summary?.actions?.length) {
      return report.summary.actions;
    }

    return [
      "Prioriser les relances sur les factures déjà en retard.",
      "Suivre les clients avec plusieurs relances sans paiement.",
      "Contrôler les échéances à venir pour éviter les bascules en impayé.",
    ];
  }, [report]);

  const totalEncaisse = useMemo(() => {
    if (report?.totals?.recettesTTC != null) {
      return formatMoney(report.totals.recettesTTC);
    }

    const totalPaid = realInvoices
      .filter((invoice) => String(invoice.status ?? "").toLowerCase() === "paid")
      .reduce((sum, invoice) => sum + moneyCentsFromInvoice(invoice), 0);

    return formatMoney(totalPaid / 100);
  }, [report, realInvoices]);

  const totalImpayes = useMemo(() => {
    const totalUnpaid = realInvoices
      .filter((invoice) => {
        const status = String(invoice.status ?? "").toLowerCase();
        return status === "sent" || status === "overdue";
      })
      .reduce((sum, invoice) => sum + moneyCentsFromInvoice(invoice), 0);

    return formatMoney(totalUnpaid / 100);
  }, [realInvoices]);

  const onCreate = () => {
    navigate("/invoices/new");
  };

  const onOpenInvoice = (invoiceId: string) => {
    navigate(`/invoices/${invoiceId}`);
  };

  const onOpenInvoicesList = () => {
    navigate("/invoices?view=all");
  };

  const onPreviousPage = () => {
    setCurrentPage((prev) => Math.max(1, prev - 1));
  };

  const onNextPage = () => {
    setCurrentPage((prev) => Math.min(totalPages, prev + 1));
  };

  const onDeleteInvoice = async (invoiceId: string) => {
    const shouldDelete = window.confirm(
      "Voulez-vous vraiment supprimer cette facture ?"
    );

    if (!shouldDelete) return;

    setLoading(true);

    try {
      await deleteInvoice(invoiceId);
      setRealInvoices((prev) =>
        prev.filter((invoice) => invoice.id !== invoiceId)
      );
    } catch {
      // best-effort
    } finally {
      setLoading(false);
    }
  };

  const onDeleteComptaInvoice = (comptaId: string) => {
    const shouldDelete = window.confirm(
      "Voulez-vous vraiment masquer cette facture issue de l’analyse compta ?"
    );

    if (!shouldDelete) return;

    setHiddenComptaIds((prev) =>
      prev.includes(comptaId) ? prev : [...prev, comptaId]
    );
  };

  const onSendReminder = async (invoiceId: string) => {
    if (!invoiceId) return;

    setRemindingInvoiceId(invoiceId);

    try {
      await sendInvoiceReminder(invoiceId);
      await loadInvoices();
    } catch {
      // best-effort
    } finally {
      setRemindingInvoiceId(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-blue-600 p-1.5 rounded-lg text-white">
              <ReceiptEuro size={16} />
            </span>
            <span className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em]">
              Finance & Gestion
            </span>
          </div>
          <h2 className="text-3xl font-extrabold text-[var(--theme-text)] tracking-tight">
            Comptabilité
          </h2>
          <p className="text-[var(--theme-muted)] mt-1 text-sm font-medium italic">
            Suivi des encaissements et relances automatiques.
          </p>
        </div>

        <div className="flex gap-3">
          <div className="bg-[var(--theme-card)] p-4 rounded-2xl border border-[var(--theme-border)] shadow-sm min-w-[140px]">
            <p className="text-[9px] font-black text-[var(--theme-muted)] uppercase mb-1">
              Total Encaissé
            </p>
            <div className="flex items-center gap-2 text-emerald-600">
              <TrendingUp size={14} />
              <p className="text-lg font-black">{totalEncaisse}</p>
            </div>
          </div>
          <div className="bg-[var(--theme-card)] p-4 rounded-2xl border border-[var(--theme-border)] shadow-sm min-w-[140px]">
            <p className="text-[9px] font-black text-[var(--theme-muted)] uppercase mb-1">
              Impayés
            </p>
            <div className="flex items-center gap-2 text-red-500">
              <AlertTriangle size={14} />
              <p className="text-lg font-black">{totalImpayes}</p>
            </div>
          </div>
          <button
            onClick={onCreate}
            disabled={loading}
            className="inline-flex items-center gap-2 bg-[var(--theme-primary)] text-white px-4 py-3 rounded-2xl font-bold text-sm hover:bg-blue-600 transition-colors disabled:opacity-60"
          >
            <Plus size={16} /> Nouvelle facture
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {CANONICAL_ACTIONS.map((action) => {
          const Icon = action.icon;

          return (
            <Link
              key={action.title}
              to={action.to}
              className="group rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--theme-bg)] text-[var(--theme-primary)]">
                <Icon size={22} />
              </div>

              <div className="text-sm font-black text-[var(--theme-text)]">
                {action.title}
              </div>
              <p className="mt-2 min-h-[40px] text-xs leading-relaxed text-[var(--theme-muted)]">
                {action.description}
              </p>

              <div className="mt-4 flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-[var(--theme-primary)]">
                Ouvrir <ArrowRight size={14} />
              </div>
            </Link>
          );
        })}
      </div>

      <div className="space-y-3 rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-indigo-600" />
          <h3 className="text-sm font-black uppercase tracking-widest text-[var(--theme-text)]">
            Insight IA
          </h3>
        </div>
        <p className="text-sm text-[var(--theme-text)]">{invoiceInsight}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-600" />
            <h3 className="text-sm font-black uppercase tracking-widest text-[var(--theme-text)]">
              Points d’attention
            </h3>
          </div>

          {attentionPoints.length > 0 ? (
            <div className="space-y-2">
              {attentionPoints.map((point) => (
                <div
                  key={point}
                  className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700"
                >
                  {point}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-[var(--theme-muted)]">
              Aucun impayé prioritaire détecté.
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <ListChecks size={16} className="text-[var(--theme-text)]" />
            <h3 className="text-sm font-black uppercase tracking-widest text-[var(--theme-text)]">
              Actions
            </h3>
          </div>

          <div className="space-y-2">
            {recommendedActions.map((action) => (
              <div
                key={action}
                className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-3 text-sm text-[var(--theme-text)]"
              >
                {action}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-[var(--theme-card)] p-3 rounded-2xl border border-[var(--theme-border)] shadow-sm">
        <div className="relative flex-1 w-full">
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--theme-muted)]"
            size={18}
          />
          <input
            type="text"
            placeholder="Rechercher un client ou une facture..."
            className="w-full pl-12 pr-4 py-3 bg-[var(--theme-bg)] border-none rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-medium"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button className="flex items-center gap-2 px-5 py-3 bg-[var(--theme-card)] border border-[var(--theme-border)] rounded-xl text-[var(--theme-muted)] font-bold hover:bg-[var(--theme-bg)] transition-colors text-xs uppercase tracking-widest">
          <Filter size={16} /> Filtres
        </button>
      </div>

      <div className="bg-[var(--theme-card)] rounded-[2rem] shadow-xl shadow-slate-200/40 border border-[var(--theme-border)] overflow-hidden">
        {isFullListView ? (
          <div className="flex items-center justify-end gap-3 border-b border-[var(--theme-border)] px-6 py-4">
            <span className="text-xs font-bold text-[var(--theme-muted)]">
              {currentRangeLabel ?? `0 / ${filteredFactures.length}`}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={onPreviousPage}
                disabled={currentPage <= 1}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] text-[var(--theme-text)] transition-colors hover:bg-[var(--theme-bg)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={onNextPage}
                disabled={currentPage >= totalPages}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] text-[var(--theme-text)] transition-colors hover:bg-[var(--theme-bg)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[var(--theme-bg)]/50 border-b border-[var(--theme-border)]">
                <th className="px-6 py-5 text-[10px] uppercase tracking-widest text-[var(--theme-muted)] font-black">
                  Référence
                </th>
                <th className="px-6 py-5 text-[10px] uppercase tracking-widest text-[var(--theme-muted)] font-black">
                  Client
                </th>
                <th className="px-6 py-5 text-[10px] uppercase tracking-widest text-[var(--theme-muted)] font-black">
                  Échéance
                </th>
                <th className="px-6 py-5 text-[10px] uppercase tracking-widest text-[var(--theme-muted)] font-black">
                  Statut
                </th>
                <th className="px-6 py-5 text-[10px] uppercase tracking-widest text-[var(--theme-muted)] font-black text-right">
                  Montant
                </th>
                <th className="px-6 py-5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {displayedFactures.map((fac) => {
                const invoiceId = fac.invoiceId;
                const isReminding = remindingInvoiceId === invoiceId;
                const canOpenInvoice =
                  fac.source === "invoice" && Boolean(invoiceId);

                return (
                  <tr
                    key={`${fac.source}-${fac.id}`}
                    className={`transition-colors group ${
                      canOpenInvoice
                        ? "hover:bg-[var(--theme-bg)]/40 cursor-pointer"
                        : "hover:bg-[var(--theme-bg)]/40"
                    }`}
                    onClick={
                      canOpenInvoice && invoiceId
                        ? () => onOpenInvoice(invoiceId)
                        : undefined
                    }
                  >
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-[var(--theme-bg)] text-[var(--theme-muted)] group-hover:bg-blue-50 group-hover:text-blue-600 rounded-xl flex items-center justify-center transition-colors">
                          <FileCheck size={18} />
                        </div>
                        <span className="font-mono text-xs font-bold text-[var(--theme-muted)]">
                          {fac.id}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-5 font-bold text-[var(--theme-text)]">
                      {fac.client}
                    </td>
                    <td className="px-6 py-5 text-[var(--theme-muted)] text-xs font-medium">
                      {fac.echeance}
                    </td>
                    <td className="px-6 py-5">
                      <StatutFacture statut={fac.statut} />
                    </td>
                    <td className="px-6 py-5 font-black text-[var(--theme-text)] text-right">
                      {fac.montant}
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center justify-end gap-2">
                        {fac.canSendReminder && invoiceId ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              void onSendReminder(invoiceId);
                            }}
                            disabled={isReminding}
                            className="flex items-center gap-2 bg-[var(--theme-primary)] text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-tighter hover:bg-blue-600 transition-all shadow-sm disabled:opacity-60"
                          >
                            <Send size={12} />
                            {isReminding ? "Relance..." : "Relance IA"}
                          </button>
                        ) : null}

                        {fac.source === "invoice" && invoiceId ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              void onDeleteInvoice(invoiceId);
                            }}
                            className="p-2 text-red-500 hover:text-red-600 rounded-lg transition-all"
                          >
                            <Trash2 size={18} />
                          </button>
                        ) : null}

                        {fac.source === "compta" ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteComptaInvoice(fac.id);
                            }}
                            className="p-2 text-red-500 hover:text-red-600 rounded-lg transition-all"
                          >
                            <Trash2 size={18} />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {displayedFactures.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-10 text-center text-sm text-[var(--theme-muted)]"
                  >
                    Aucune facture trouvée.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {!isFullListView && filteredFactures.length > 5 ? (
        <div className="flex justify-center">
          <button
            onClick={onOpenInvoicesList}
            className="inline-flex items-center justify-center rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-5 py-3 text-sm font-bold text-[var(--theme-text)] shadow-sm transition-colors hover:bg-[var(--theme-bg)]"
          >
            Voir la liste complète des factures
          </button>
        </div>
      ) : null}
    </div>
  );
}

function StatutFacture({ statut }: { statut: FactureItem["statut"] }) {
  const configs = {
    PAYÉ: {
      style: "bg-emerald-50 text-emerald-700 border-emerald-100",
      icon: <CheckCircle2 size={12} />,
      label: "PAYÉ",
    },
    RETARD: {
      style: "bg-red-50 text-red-700 border-red-100",
      icon: <AlertTriangle size={12} />,
      label: "IMPAYÉ",
    },
    ATTENTE: {
      style:
        "bg-[var(--theme-bg)] text-[var(--theme-muted)] border-[var(--theme-border)]",
      icon: <Clock size={12} />,
      label: "ATTENTE",
    },
  };

  const current = configs[statut];

  return (
    <span
      className={`flex items-center gap-1.5 w-fit px-3 py-1.5 rounded-full text-[9px] font-black tracking-widest border ${current.style}`}
    >
      {current.icon} {current.label}
    </span>
  );
}