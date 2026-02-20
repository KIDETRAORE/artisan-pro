import { useState, useMemo } from 'react';
import { 
  Search, 
  FileCheck, 
  Download, 
  Send, 
  Trash2, 
  AlertTriangle, 
  CheckCircle2, 
  Clock,
  Filter,
  History
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

export default function Factures() {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredFactures = useMemo(() => {
    return MOCK_FACTURES.filter(item => 
      item.client.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.id.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [searchTerm]);

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Facturation & Suivi</h2>
          <p className="text-slate-500 mt-1 text-lg">Suivez vos encaissements et gérez les relances clients.</p>
        </div>
        <div className="flex items-center gap-3">
            <div className="text-right hidden md:block">
                <p className="text-xs font-bold text-slate-400 uppercase">Total Impayé</p>
                <p className="text-xl font-black text-red-500">5 390.00€</p>
            </div>
        </div>
      </div>

      {/* BARRE D'OUTILS */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
        <div className="relative flex-1 w-full max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Rechercher une facture..."
            className="w-full pl-12 pr-4 py-3 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-600 font-medium hover:bg-slate-50 transition-colors text-sm">
            <Filter size={18} /> Filtres
          </button>
        </div>
      </div>

      {/* TABLEAU DES FACTURES */}
      <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-6 py-5 text-xs uppercase tracking-widest text-slate-400 font-black">Facture</th>
                <th className="px-6 py-5 text-xs uppercase tracking-widest text-slate-400 font-black">Client</th>
                <th className="px-6 py-5 text-xs uppercase tracking-widest text-slate-400 font-black">Échéance</th>
                <th className="px-6 py-5 text-xs uppercase tracking-widest text-slate-400 font-black">Relances</th>
                <th className="px-6 py-5 text-xs uppercase tracking-widest text-slate-400 font-black">Montant TTC</th>
                <th className="px-6 py-5 text-xs uppercase tracking-widest text-slate-400 font-black">Statut</th>
                <th className="px-6 py-5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredFactures.map((fac) => (
                <tr key={fac.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                        <FileCheck size={20} />
                      </div>
                      <span className="font-mono text-sm font-bold text-slate-700">{fac.id}</span>
                    </div>
                  </td>
                  <td className="px-6 py-5 font-semibold text-slate-900">{fac.client}</td>
                  <td className="px-6 py-5 text-slate-500 text-sm">{fac.echeance}</td>
                  <td className="px-6 py-5">
                    <span className={`text-xs font-bold px-2 py-1 rounded-md ${fac.nbRelances > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-400'}`}>
                      {fac.nbRelances} {fac.nbRelances > 1 ? 'relances' : 'relance'}
                    </span>
                  </td>
                  <td className="px-6 py-5 font-black text-slate-900">{fac.montant}</td>
                  <td className="px-6 py-5">
                    <StatutFacture statut={fac.statut} />
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex items-center justify-end gap-2">
                      {fac.statut === 'RETARD' && (
                        <button className="flex items-center gap-2 bg-slate-900 text-white px-3 py-2 rounded-xl text-xs font-bold hover:bg-blue-600 transition-all shadow-md">
                          <Send size={14} /> Relancer IA
                        </button>
                      )}
                      <button className="p-2 text-slate-400 hover:text-blue-600 rounded-lg transition-all" title="Historique">
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
    'PAYÉ': { style: 'bg-emerald-50 text-emerald-700 border-emerald-100', icon: <CheckCircle2 size={14} />, label: 'ENCAISSÉ' },
    'RETARD': { style: 'bg-red-50 text-red-700 border-red-100', icon: <AlertTriangle size={14} />, label: 'IMPAYÉ' },
    'ATTENTE': { style: 'bg-slate-100 text-slate-600 border-slate-200', icon: <Clock size={14} />, label: 'EN ATTENTE' }
  };
  const current = configs[statut];
  return (
    <span className={`flex items-center gap-1.5 w-fit px-3 py-1.5 rounded-full text-[10px] font-black tracking-widest border ${current.style}`}>
      {current.icon} {current.label}
    </span>
  );
}