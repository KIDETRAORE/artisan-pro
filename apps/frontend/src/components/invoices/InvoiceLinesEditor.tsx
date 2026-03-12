// apps/frontend/src/components/invoices/InvoiceLinesEditor.tsx
import React, { useMemo, useState } from "react";
import { Plus, Trash2, Pencil, RefreshCw } from "lucide-react";
import {
  createInvoiceLine,
  deleteInvoiceLine,
  patchInvoiceLine,
  type InvoiceLine,
} from "../../services/salesInvoices.api";

type Props = {
  loading: boolean;
  invoiceId: string;
  lines: InvoiceLine[];
  onChangeLines: (lines: InvoiceLine[]) => void;
  onReload: () => Promise<void> | void;
  readOnly?: boolean;
};

function formatEurFromCents(cents: number): string {
  const euros = (Number.isFinite(cents) ? cents : 0) / 100;
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(euros);
}

export default function InvoiceLinesEditor({
  loading,
  invoiceId,
  lines,
  onChangeLines,
  onReload,
  readOnly = false,
}: Props) {
  const [draftDesc, setDraftDesc] = useState("");
  const [draftQty, setDraftQty] = useState<number>(1);
  const [draftUnitEur, setDraftUnitEur] = useState<string>("0");
  const [draftTax, setDraftTax] = useState<number>(20);

  const [editingId, setEditingId] = useState<string | null>(null);

  const totals = useMemo(() => {
    const subtotal = lines.reduce((a, l) => a + (l.line_total_cents ?? 0), 0);
    const tax = lines.reduce((a, l) => {
      const rate = Number.isFinite(l.tax_rate) ? l.tax_rate : 0;
      return a + Math.round((l.line_total_cents ?? 0) * (rate / 100));
    }, 0);

    return { subtotal, tax, total: subtotal + tax };
  }, [lines]);

  const unitCents = useMemo(() => {
    const n = Number(String(draftUnitEur).replace(",", "."));
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100);
  }, [draftUnitEur]);

  const add = async () => {
    if (readOnly) return;

    const desc = draftDesc.trim();
    if (!desc || !invoiceId) return;

    try {
      const created = await createInvoiceLine({
        invoice_id: invoiceId,
        description: desc,
        quantity: draftQty,
        unit_price_cents: unitCents,
        tax_rate: draftTax,
      });

      onChangeLines([...lines, created]);
      setDraftDesc("");
      setDraftQty(1);
      setDraftUnitEur("0");
      setDraftTax(20);
    } catch {
      // best-effort
    }
  };

  const remove = async (id: string) => {
    if (readOnly) return;

    try {
      await deleteInvoiceLine(id);
      onChangeLines(lines.filter((l) => l.id !== id));
    } catch {
      // best-effort
    }
  };

  const startEdit = (id: string) => {
    if (readOnly) return;
    setEditingId(id);
  };

  const stopEdit = () => setEditingId(null);

  const saveEdit = async (line: InvoiceLine, patch: Partial<InvoiceLine>) => {
    if (readOnly) return;

    try {
      const updated = await patchInvoiceLine(line.id, {
        description: patch.description ?? line.description,
        quantity: patch.quantity ?? line.quantity,
        unit_price_cents: patch.unit_price_cents ?? line.unit_price_cents,
        tax_rate: patch.tax_rate ?? line.tax_rate,
      });

      onChangeLines(lines.map((l) => (l.id === line.id ? updated : l)));
      stopEdit();
    } catch {
      // best-effort
    }
  };

  return (
    <div className="bg-[var(--theme-card)] rounded-3xl shadow-xl shadow-slate-200/50 border border-[var(--theme-border)] overflow-hidden">
      <div className="p-6 border-b border-[var(--theme-border)] flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-[var(--theme-text)]">
            Lignes de facture
          </h3>
          <p className="text-[11px] text-[var(--theme-muted)] font-medium mt-1">
            {readOnly
              ? "Les lignes sont verrouillées pour cette facture."
              : "Ajoute au moins 1 ligne avant de finaliser."}
          </p>
        </div>

        <button
          onClick={() => onReload()}
          disabled={loading}
          className="inline-flex items-center gap-2 text-sm font-bold text-[var(--theme-muted)] hover:text-[var(--theme-text)] disabled:opacity-60"
        >
          <RefreshCw size={16} /> Recharger
        </button>
      </div>

      <div className="p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <div className="md:col-span-2">
            <Label>Description</Label>
            <input
              value={draftDesc}
              onChange={(e) => setDraftDesc(e.target.value)}
              placeholder="Ex: Main d’œuvre"
              disabled={readOnly || loading}
              className="w-full px-4 py-3 rounded-2xl border border-[var(--theme-border)] outline-none focus:border-blue-300 bg-[var(--theme-card)] text-sm font-semibold text-[var(--theme-text)] disabled:opacity-60"
            />
          </div>

          <div>
            <Label>Qté</Label>
            <input
              type="number"
              min={0}
              step={1}
              value={draftQty}
              onChange={(e) => setDraftQty(Number(e.target.value))}
              disabled={readOnly || loading}
              className="w-full px-4 py-3 rounded-2xl border border-[var(--theme-border)] outline-none focus:border-blue-300 bg-[var(--theme-card)] text-sm font-semibold text-[var(--theme-text)] disabled:opacity-60"
            />
          </div>

          <div>
            <Label>PU (€)</Label>
            <input
              value={draftUnitEur}
              onChange={(e) => setDraftUnitEur(e.target.value)}
              disabled={readOnly || loading}
              className="w-full px-4 py-3 rounded-2xl border border-[var(--theme-border)] outline-none focus:border-blue-300 bg-[var(--theme-card)] text-sm font-semibold text-[var(--theme-text)] disabled:opacity-60"
            />
          </div>

          <div>
            <Label>TVA (%)</Label>
            <input
              type="number"
              min={0}
              step={0.1}
              value={draftTax}
              onChange={(e) => setDraftTax(Number(e.target.value))}
              disabled={readOnly || loading}
              className="w-full px-4 py-3 rounded-2xl border border-[var(--theme-border)] outline-none focus:border-blue-300 bg-[var(--theme-card)] text-sm font-semibold text-[var(--theme-text)] disabled:opacity-60"
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={add}
              disabled={readOnly || loading || !draftDesc.trim() || !invoiceId}
              className="w-full inline-flex items-center justify-center gap-2 bg-[var(--theme-primary)] text-white px-4 py-3 rounded-2xl font-bold text-sm hover:bg-blue-600 transition-colors disabled:opacity-60"
            >
              <Plus size={16} /> Ajouter
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="bg-[var(--theme-bg)]/60">
              <tr className="text-xs font-black uppercase tracking-widest text-[var(--theme-muted)]">
                <th className="px-3 py-3">Description</th>
                <th className="px-3 py-3">Qté</th>
                <th className="px-3 py-3">PU</th>
                <th className="px-3 py-3">TVA</th>
                <th className="px-3 py-3 text-right">Total HT</th>
                <th className="px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-50">
              {lines.length > 0 ? (
                lines.map((l) => (
                  <LineRow
                    key={l.id}
                    line={l}
                    isEditing={!readOnly && editingId === l.id}
                    readOnly={readOnly}
                    onStartEdit={() => startEdit(l.id)}
                    onCancel={stopEdit}
                    onSave={(patch: Partial<InvoiceLine>) => saveEdit(l, patch)}
                    onDelete={() => remove(l.id)}
                  />
                ))
              ) : (
                <tr>
                  <td
                    className="px-3 py-6 text-sm text-[var(--theme-muted)]"
                    colSpan={6}
                  >
                    Aucune ligne.
                  </td>
                </tr>
              )}
            </tbody>

            {lines.length > 0 ? (
              <tfoot className="bg-[var(--theme-bg)]/40">
                <tr>
                  <td
                    className="px-3 py-3 text-xs font-black uppercase tracking-widest text-[var(--theme-muted)]"
                    colSpan={4}
                  >
                    Totaux (estimations)
                  </td>
                  <td className="px-3 py-3 text-right font-black text-[var(--theme-text)]">
                    {formatEurFromCents(totals.subtotal)}
                  </td>
                  <td className="px-3 py-3 text-right text-sm font-black text-[var(--theme-text)]">
                    TTC: {formatEurFromCents(totals.total)}
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-black uppercase tracking-widest text-[var(--theme-muted)] mb-2">
      {children}
    </div>
  );
}

type LineRowProps = {
  line: InvoiceLine;
  isEditing: boolean;
  readOnly: boolean;
  onStartEdit: () => void;
  onCancel: () => void;
  onSave: (patch: Partial<InvoiceLine>) => void;
  onDelete: () => void;
};

function LineRow({
  line,
  isEditing,
  readOnly,
  onStartEdit,
  onCancel,
  onSave,
  onDelete,
}: LineRowProps) {
  const [desc, setDesc] = useState(line.description);
  const [qty, setQty] = useState<number>(line.quantity);
  const [unit, setUnit] = useState<number>(line.unit_price_cents);
  const [tax, setTax] = useState<number>(line.tax_rate);

  React.useEffect(() => {
    setDesc(line.description);
    setQty(line.quantity);
    setUnit(line.unit_price_cents);
    setTax(line.tax_rate);
  }, [
    line.id,
    line.description,
    line.quantity,
    line.unit_price_cents,
    line.tax_rate,
  ]);

  const totalHT = Math.round(qty * unit);

  return (
    <tr className="text-sm">
      <td className="px-3 py-3 font-semibold text-[var(--theme-text)]">
        {isEditing ? (
          <input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-[var(--theme-border)] outline-none focus:border-blue-300"
          />
        ) : (
          line.description
        )}
      </td>

      <td className="px-3 py-3 text-[var(--theme-text)]">
        {isEditing ? (
          <input
            type="number"
            min={0}
            step={1}
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
            className="w-24 px-3 py-2 rounded-xl border border-[var(--theme-border)] outline-none focus:border-blue-300"
          />
        ) : (
          line.quantity
        )}
      </td>

      <td className="px-3 py-3 text-[var(--theme-text)]">
        {isEditing ? (
          <input
            type="number"
            min={0}
            step={1}
            value={unit}
            onChange={(e) => setUnit(Number(e.target.value))}
            className="w-28 px-3 py-2 rounded-xl border border-[var(--theme-border)] outline-none focus:border-blue-300"
          />
        ) : (
          `${formatEurFromCents(line.unit_price_cents)}`
        )}
      </td>

      <td className="px-3 py-3 text-[var(--theme-text)]">
        {isEditing ? (
          <input
            type="number"
            min={0}
            step={0.1}
            value={tax}
            onChange={(e) => setTax(Number(e.target.value))}
            className="w-24 px-3 py-2 rounded-xl border border-[var(--theme-border)] outline-none focus:border-blue-300"
          />
        ) : (
          `${line.tax_rate}%`
        )}
      </td>

      <td className="px-3 py-3 text-right font-black text-[var(--theme-text)]">
        {formatEurFromCents(totalHT)}
      </td>

      <td className="px-3 py-3 text-right">
        {isEditing ? (
          <div className="inline-flex items-center gap-2">
            <button
              onClick={() =>
                onSave({
                  description: desc,
                  quantity: qty,
                  unit_price_cents: unit,
                  tax_rate: tax,
                })
              }
              className="px-3 py-2 rounded-xl bg-[var(--theme-primary)] text-white font-bold text-xs hover:bg-blue-600 transition-colors"
            >
              OK
            </button>
            <button
              onClick={onCancel}
              className="px-3 py-2 rounded-xl bg-[var(--theme-card)] border border-[var(--theme-border)] text-[var(--theme-text)] font-bold text-xs hover:bg-[var(--theme-bg)] transition-colors"
            >
              Annuler
            </button>
          </div>
        ) : readOnly ? (
          <span className="text-xs font-bold text-[var(--theme-muted)]">
            Verrouillé
          </span>
        ) : (
          <div className="inline-flex items-center gap-2">
            <button
              onClick={onStartEdit}
              className="p-2 rounded-xl bg-[var(--theme-card)] border border-[var(--theme-border)] text-[var(--theme-text)] hover:bg-[var(--theme-bg)] transition-colors"
              title="Modifier"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={onDelete}
              className="p-2 rounded-xl bg-[var(--theme-card)] border border-red-200 text-red-700 hover:bg-red-50 transition-colors"
              title="Supprimer"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}