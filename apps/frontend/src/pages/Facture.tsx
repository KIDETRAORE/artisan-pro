// apps/frontend/src/pages/Facture.tsx
import { useState, useMemo } from 'react';
import { 
  Search, 
  FileCheck, 
  Send, 
  AlertTriangle, 
  CheckCircle2, 
  Clock,
  Filter,
  History,
  TrendingUp,
  ReceiptEuro
} from 'lucide-react';

interface FactureItem {
  id: string;
  client: string;
  echeance: string;
  montant: string;
  statut: 'PAYÉ' | 'RETARD' | 'ATTENTE';
  nbRelances: number;
}

const MOCK_FACTURES: FactureItem[] = [
  { id: 'FAC-2026-001', client: 'Jean Dupont', echeance: '15/02/2026', montant: '1,250.00€', statut: 'PAYÉ', nbRelances: 0 },
  { id: 'FAC-2026-002', client: 'Entreprise Leroy', echeance: '05/02/2026', montant: '4,840.00€', statut: 'RETARD', nbRelances: 2 },
  { id: 'FAC-2026-003', client: 'Boulangerie Soleil', echeance: '25/02/2026', montant: '2,100.00€', statut: 'ATTENTE', nbRelances: 0 },
  { id: 'FAC-2026-004', client: 'Marc Morel', echeance: '10/02/2026', montant: '550.00€', statut: 'RETARD', nbRelances: 1 },
];

// Changement du nom de la fonction en "Compta" pour correspondre au routeur
export default function Compta() {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredFactures = useMemo(() => {
    return MOCK_FACTURES.filter(item => 
      item.client.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.id.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [searchTerm]);

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-10">
      
      {/* HEADER AVEC STATS RAPIDES */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-blue-600 p-1.5 rounded-lg text-white">
                <ReceiptEuro size={16} />
            </span>
            <span className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em]">Finance & Gestion</span>
          </div>
          <h2 className="text-3xl font-extrabold text-[var(--theme-text)] tracking-tight">Comptabilité</h2>
          <p className="text-[var(--theme-muted)] mt-1 text-sm font-medium italic">Suivi des encaissements et relances automatiques.</p>
        </div>
        
        <div className="flex gap-3">
            <div className="bg-[var(--theme-card)] p-4 rounded-2xl border border-[var(--theme-border)] shadow-sm min-w-[140px]">
                <p className="text-[9px] font-black text-[var(--theme-muted)] uppercase mb-1">Total Encaissé</p>
                <div className="flex items-center gap-2 text-emerald-600">
                    <TrendingUp size={14} />
                    <p className="text-lg font-black">8 190€</p>
                </div>
            </div>
            <div className="bg-[var(--theme-card)] p-4 rounded-2xl border border-[var(--theme-border)] shadow-sm min-w-[140px]">
                <p className="text-[9px] font-black text-[var(--theme-muted)] uppercase mb-1">Impayés</p>
                <div className="flex items-center gap-2 text-red-500">
                    <AlertTriangle size={14} />
                    <p className="text-lg font-black">5 390€</p>
                </div>
            </div>
        </div>
      </div>

      {/* BARRE DE RECHERCHE */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-[var(--theme-card)] p-3 rounded-2xl border border-[var(--theme-border)] shadow-sm">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--theme-muted)]" size={18} />
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

      {/* TABLEAU DES FACTURES */}
      <div className="bg-[var(--theme-card)] rounded-[2rem] shadow-xl shadow-slate-200/40 border border-[var(--theme-border)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[var(--theme-bg)]/50 border-b border-[var(--theme-border)]">
                <th className="px-6 py-5 text-[10px] uppercase tracking-widest text-[var(--theme-muted)] font-black">Référence</th>
                <th className="px-6 py-5 text-[10px] uppercase tracking-widest text-[var(--theme-muted)] font-black">Client</th>
                <th className="px-6 py-5 text-[10px] uppercase tracking-widest text-[var(--theme-muted)] font-black">Échéance</th>
                <th className="px-6 py-5 text-[10px] uppercase tracking-widest text-[var(--theme-muted)] font-black">Statut</th>
                <th className="px-6 py-5 text-[10px] uppercase tracking-widest text-[var(--theme-muted)] font-black text-right">Montant</th>
                <th className="px-6 py-5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredFactures.map((fac) => (
                <tr key={fac.id} className="hover:bg-[var(--theme-bg)]/40 transition-colors group">
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-[var(--theme-bg)] text-[var(--theme-muted)] group-hover:bg-blue-50 group-hover:text-blue-600 rounded-xl flex items-center justify-center transition-colors">
                        <FileCheck size={18} />
                      </div>
                      <span className="font-mono text-xs font-bold text-[var(--theme-muted)]">{fac.id}</span>
                    </div>
                  </td>
                  <td className="px-6 py-5 font-bold text-[var(--theme-text)]">{fac.client}</td>
                  <td className="px-6 py-5 text-[var(--theme-muted)] text-xs font-medium">{fac.echeance}</td>
                  <td className="px-6 py-5">
                    <StatutFacture statut={fac.statut} />
                  </td>
                  <td className="px-6 py-5 font-black text-[var(--theme-text)] text-right">{fac.montant}</td>
                  <td className="px-6 py-5">
                    <div className="flex items-center justify-end gap-2">
                      {fac.statut === 'RETARD' && (
                        <button className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-tighter hover:bg-blue-600 transition-all shadow-sm">
                          <Send size={12} /> Relance IA
                        </button>
                      )}
                      <button className="p-2 text-slate-300 hover:text-[var(--theme-muted)] rounded-lg transition-all">
                        <History size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatutFacture({ statut }: { statut: FactureItem['statut'] }) {
  const configs = {
    'PAYÉ': { style: 'bg-emerald-50 text-emerald-700 border-emerald-100', icon: <CheckCircle2 size={12} />, label: 'PAYÉ' },
    'RETARD': { style: 'bg-red-50 text-red-700 border-red-100', icon: <AlertTriangle size={12} />, label: 'IMPAYÉ' },
    'ATTENTE': { style: 'bg-[var(--theme-bg)] text-[var(--theme-muted)] border-[var(--theme-border)]', icon: <Clock size={12} />, label: 'ATTENTE' }
  };
  const current = configs[statut];
  return (
    <span className={`flex items-center gap-1.5 w-fit px-3 py-1.5 rounded-full text-[9px] font-black tracking-widest border ${current.style}`}>
      {current.icon} {current.label}
    </span>
  );
}
