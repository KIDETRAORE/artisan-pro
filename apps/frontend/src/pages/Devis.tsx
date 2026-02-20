import { useState, useMemo } from 'react';
import { 
  Plus, 
  Search, 
  FileText, 
  Download, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  Filter
} from 'lucide-react';

// Structure de données typée
interface DevisItem {
  id: string;
  client: string;
  date: string;
  montant: string;
  statut: 'PAYÉ' | 'ATTENTE' | 'PROVISOIRE';
}

const MOCK_DEVIS: DevisItem[] = [
  { id: 'DEV-2026-001', client: 'Jean Dupont', date: '20/02/2026', montant: '1,250.00€', statut: 'PAYÉ' },
  { id: 'DEV-2026-002', client: 'Entreprise Leroy', date: '18/02/2026', montant: '4,840.00€', statut: 'ATTENTE' },
  { id: 'DEV-2026-003', client: 'Boulangerie Soleil', date: '15/02/2026', montant: '2,100.00€', statut: 'PROVISOIRE' },
  { id: 'DEV-2026-004', client: 'Marc Morel', date: '10/02/2026', montant: '550.00€', statut: 'ATTENTE' },
];

export default function Devis() {
  const [searchTerm, setSearchTerm] = useState('');

  // Logique de recherche filtrée
  const filteredDevis = useMemo(() => {
    return MOCK_DEVIS.filter(item => 
      item.client.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.id.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [searchTerm]);

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* HEADER DE PAGE */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Devis & Factures</h2>
          <p className="text-slate-500 mt-1 text-lg">Gérez vos documents commerciaux et suivez vos paiements.</p>
        </div>
        <button className="flex items-center justify-center gap-2 bg-blue-600 text-white px-6 py-4 rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 group">
          <Plus size={20} className="group-hover:rotate-90 transition-transform" /> 
          Créer un document
        </button>
      </div>

      {/* BARRE D'OUTILS ET FILTRES */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
        <div className="relative flex-1 w-full max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Rechercher un client ou un numéro..."
            className="w-full pl-12 pr-4 py-3 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <button className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-600 font-medium hover:bg-slate-50 transition-colors text-sm">
            <Filter size={18} /> Filtres
          </button>
          <button className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-600 font-medium hover:bg-slate-50 transition-colors text-sm">
            <Download size={18} /> Exporter
          </button>
        </div>
      </div>

      {/* TABLEAU PREMIUM */}
      <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-6 py-5 text-xs uppercase tracking-widest text-slate-400 font-black">Référence</th>
                <th className="px-6 py-5 text-xs uppercase tracking-widest text-slate-400 font-black">Client</th>
                <th className="px-6 py-5 text-xs uppercase tracking-widest text-slate-400 font-black">Date d'émission</th>
                <th className="px-6 py-5 text-xs uppercase tracking-widest text-slate-400 font-black">Montant TTC</th>
                <th className="px-6 py-5 text-xs uppercase tracking-widest text-slate-400 font-black">État</th>
                <th className="px-6 py-5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredDevis.map((devis) => (
                <tr key={devis.id} className="hover:bg-blue-50/30 transition-colors group">
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-slate-100 text-slate-500 rounded-xl flex items-center justify-center group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
                        <FileText size={20} />
                      </div>
                      <span className="font-mono text-sm font-bold text-slate-700">{devis.id}</span>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <span className="font-semibold text-slate-900">{devis.client}</span>
                  </td>
                  <td className="px-6 py-5 text-slate-500 text-sm">{devis.date}</td>
                  <td className="px-6 py-5 font-black text-slate-900">{devis.montant}</td>
                  <td className="px-6 py-5">
                    <StatutBadge statut={devis.statut} />
                  </td>
                  <td className="px-6 py-5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="Télécharger">
                        <Download size={18} />
                      </button>
                      <button className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all" title="Supprimer">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredDevis.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                    Aucun document trouvé pour "{searchTerm}"
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* FOOTER DE TABLEAU */}
        <div className="bg-slate-50/50 px-6 py-4 border-t border-slate-100 flex items-center justify-between">
          <p className="text-xs text-slate-400 font-medium">Affichage de {filteredDevis.length} documents</p>
          <div className="flex gap-2">
            <button className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors" disabled>Précédent</button>
            <button className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors">Suivant</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Sous-composant typé
function StatutBadge({ statut }: { statut: DevisItem['statut'] }) {
  const configs = {
    'PAYÉ': { style: 'bg-emerald-50 text-emerald-700 border-emerald-100', icon: <CheckCircle2 size={14} /> },
    'ATTENTE': { style: 'bg-amber-50 text-amber-700 border-amber-100', icon: <Clock size={14} /> },
    'PROVISOIRE': { style: 'bg-slate-100 text-slate-600 border-slate-200', icon: <AlertCircle size={14} /> }
  };

  const current = configs[statut];

  return (
    <span className={`flex items-center gap-1.5 w-fit px-3 py-1.5 rounded-full text-[10px] font-black tracking-widest border transition-all ${current.style}`}>
      {current.icon}
      {statut}
    </span>
  );
}