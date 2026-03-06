// apps/frontend/src/components/invoices/InvoiceEditor.tsx
import React, { useEffect, useMemo, useState } from "react";
// ✅ MODIF UNIQUE: corrige le chemin (services est sous src/, donc on remonte de 3 niveaux)
import type { Invoice } from "../../services/invoices.api";

type Props = {
  loading: boolean;
  invoice: Invoice | null;
  onSave: (patch: {
    client_name: string;
    client_email: string | null;
    due_date: string;
  }) => Promise<void> | void;
};

export default function InvoiceEditor({ loading, invoice, onSave }: Props) {
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>("");

  useEffect(() => {
    setClientName(invoice?.client_name ?? "");
    setClientEmail(invoice?.client_email ?? "");
    setDueDate((invoice?.due_date ?? "").slice(0, 10));
  }, [invoice?.id]);

  const canSave = useMemo(() => {
    if (!invoice) return false;
    if (!clientName.trim()) return false;
    if (!dueDate.trim()) return false;
    return true;
  }, [invoice, clientName, dueDate]);

  const submit = async () => {
    if (!canSave) return;
    await onSave({
      client_name: clientName.trim(),
      client_email: clientEmail.trim() ? clientEmail.trim() : null,
      due_date: new Date(dueDate).toISOString(),
    });
  };

  return (
    <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
      <div className="p-6 border-b border-slate-50">
        <h3 className="text-lg font-bold text-slate-900">Informations client</h3>
        <p className="text-[11px] text-slate-500 font-medium mt-1">
          Renseigne le client et l’échéance. Le reste est calculé via les lignes.
        </p>
      </div>

      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Nom client">
          <input
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            className="w-full px-4 py-3 rounded-2xl border border-slate-200 outline-none focus:border-blue-300 bg-white text-sm font-semibold text-slate-900"
            placeholder="Nom / Société"
          />
        </Field>

        <Field label="Email (optionnel)">
          <input
            value={clientEmail}
            onChange={(e) => setClientEmail(e.target.value)}
            className="w-full px-4 py-3 rounded-2xl border border-slate-200 outline-none focus:border-blue-300 bg-white text-sm font-semibold text-slate-900"
            placeholder="client@mail.com"
          />
        </Field>

        <Field label="Date d’échéance">
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full px-4 py-3 rounded-2xl border border-slate-200 outline-none focus:border-blue-300 bg-white text-sm font-semibold text-slate-900"
          />
        </Field>

        <div className="flex items-end justify-end">
          <button
            onClick={submit}
            disabled={!canSave || loading}
            className="inline-flex items-center justify-center bg-slate-900 text-white px-5 py-3 rounded-2xl font-bold text-sm hover:bg-blue-600 transition-colors disabled:opacity-60 w-full md:w-auto"
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: any) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-black uppercase tracking-widest text-slate-400">
        {label}
      </div>
      {children}
    </div>
  );
}