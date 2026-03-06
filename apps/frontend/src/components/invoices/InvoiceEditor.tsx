// apps/frontend/src/components/invoices/InvoiceEditor.tsx
import React, { useEffect, useMemo, useState } from "react";
import type { Invoice } from "../../services/invoices.api";
import { listProjects, type Project } from "../../api/projects.api";

type Props = {
  loading: boolean;
  invoice: Invoice | null;
  onSave: (patch: {
    client_name: string;
    client_email: string | null;
    due_date: string;
    project_id: string | null;
  }) => Promise<void> | void;
};

export default function InvoiceEditor({ loading, invoice, onSave }: Props) {
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>("");
  const [projectId, setProjectId] = useState<string>("");

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);

  useEffect(() => {
    setClientName(invoice?.client_name ?? "");
    setClientEmail(invoice?.client_email ?? "");
    setDueDate((invoice?.due_date ?? "").slice(0, 10));
    setProjectId(invoice?.project_id ?? "");
  }, [invoice?.id, invoice?.client_name, invoice?.client_email, invoice?.due_date, invoice?.project_id]);

  useEffect(() => {
    let isMounted = true;

    const loadProjects = async () => {
      setProjectsLoading(true);
      try {
        const data = await listProjects();
        if (!isMounted) return;
        setProjects(Array.isArray(data) ? data : []);
      } catch {
        if (!isMounted) return;
        setProjects([]);
      } finally {
        if (isMounted) {
          setProjectsLoading(false);
        }
      }
    };

    void loadProjects();

    return () => {
      isMounted = false;
    };
  }, []);

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
      project_id: projectId.trim() ? projectId : null,
    });
  };

  return (
    <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
      <div className="p-6 border-b border-slate-50">
        <h3 className="text-lg font-bold text-slate-900">Informations client</h3>
        <p className="text-[11px] text-slate-500 font-medium mt-1">
          Renseigne le client, l’échéance et rattache la facture à un chantier si
          besoin. Le reste est calculé via les lignes.
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

        <Field label="Chantier (optionnel)">
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full px-4 py-3 rounded-2xl border border-slate-200 outline-none focus:border-blue-300 bg-white text-sm font-semibold text-slate-900"
          >
            <option value="">
              {projectsLoading ? "Chargement des chantiers…" : "Aucun chantier"}
            </option>

            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </Field>

        <div className="md:col-span-2 flex items-end justify-end">
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

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-black uppercase tracking-widest text-slate-400">
        {label}
      </div>
      {children}
    </div>
  );
}