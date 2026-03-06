// apps/frontend/src/pages/Invoices.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, FileText, ArrowRight, Search } from "lucide-react";
import {
  createInvoiceDraft,
  listInvoices,
  moneyCentsFromInvoice,
  type Invoice,
} from "../services/invoices.api";

function formatEurFromCents(cents: number): string {
  const euros = (Number.isFinite(cents) ? cents : 0) / 100;
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(euros);
}

function isoDatePlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function Invoices() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const fetchOnceRef = useRef(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await listInvoices();
      // ✅ MODIF: normalisation defensive (évite crash si API renvoie autre chose)
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (fetchOnceRef.current) return;
    fetchOnceRef.current = true;
    void load();
  }, []);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return items;

    return items.filter((it) => {
      const id = String(it.id ?? "").toLowerCase();
      const cn = String(it.client_name ?? "").toLowerCase();
      const st = String(it.status ?? "").toLowerCase();
      return id.includes(query) || cn.includes(query) || st.includes(query);
    });
  }, [items, q]);

  const onCreate = async () => {
    setLoading(true);
    try {
      const inv = await createInvoiceDraft({
        client_name: "Nouveau client",
        client_email: null,
        due_date: isoDatePlusDays(14),
      });
      navigate(`/invoices/${inv.id}`);
    } catch {
      // best-effort
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-700">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            Factures
          </h2>
          <p className="text-slate-500 mt-1">
            Créez vos factures dans ArtisanPro, ajoutez les lignes, puis finalisez
            (sync).
          </p>
        </div>

        <button
          onClick={onCreate}
          disabled={loading}
          className="inline-flex items-center gap-2 bg-slate-900 text-white px-4 py-3 rounded-2xl font-bold text-sm hover:bg-blue-600 transition-colors disabled:opacity-60"
        >
          <Plus size={16} /> Nouvelle facture
        </button>
      </div>

      <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-50 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 w-full max-w-md bg-slate-50 rounded-2xl px-3 py-2 border border-slate-100">
            <Search size={16} className="text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher (client, statut, id)…"
              className="w-full bg-transparent outline-none text-sm font-medium text-slate-700 placeholder:text-slate-400"
            />
          </div>

          <button
            onClick={load}
            disabled={loading}
            className="text-sm font-bold text-slate-500 hover:text-slate-900 disabled:opacity-60"
          >
            Rafraîchir
          </button>
        </div>

        <div className="divide-y divide-slate-50">
          {filtered.length > 0 ? (
            filtered.map((it) => (
              <Link
                key={it.id}
                to={`/invoices/${it.id}`}
                className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">
                    <FileText size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">
                      {it.client_name || "Client"}
                    </p>
                    <p className="text-xs text-slate-500 font-medium">
                      #{String(it.id).slice(0, 8)} •{" "}
                      {String(it.status).toUpperCase()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <span className="text-sm font-black text-slate-900">
                    {formatEurFromCents(moneyCentsFromInvoice(it))}
                  </span>
                  <ArrowRight size={18} className="text-slate-400" />
                </div>
              </Link>
            ))
          ) : (
            <div className="p-8 text-sm text-slate-500 text-center">
              {loading ? "Chargement…" : "Aucune facture."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}