import React from 'react';
import { 
  TrendingUp, 
  Clock, 
  AlertTriangle, 
  Send, 
  ArrowRight,
  FileText,
  Users
} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-700">
      
      {/* 1. EN-TÊTE DYNAMIQUE */}
      <div>
        <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Tableau de bord</h2>
        <p className="text-slate-500 mt-1">Bienvenue sur votre centre de pilotage ArtisanPro.</p>
      </div>

      {/* 2. STATS RAPIDES (DEVIS & CA) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard 
          title="Chiffre d'Affaires" 
          value="12 450 €" 
          trend="+12% ce mois" 
          icon={<TrendingUp className="text-emerald-500" />} 
        />
        <StatCard 
          title="Devis en attente" 
          value="8" 
          trend="3 urgents" 
          icon={<Clock className="text-amber-500" />} 
        />
        <StatCard 
          title="Factures impayées" 
          value="3 200 €" 
          trend="Action requise" 
          icon={<AlertTriangle className="text-red-500" />} 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* 3. SECTION FACTURES & RELANCES (L'élément clé) */}
        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden flex flex-col">
          <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-gradient-to-r from-slate-50 to-white">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Factures & Relances</h3>
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mt-1">Trésorerie active</p>
            </div>
            <Link to="/factures" className="text-blue-600 text-sm font-bold flex items-center gap-1 hover:gap-2 transition-all">
              Gérer les impayés <ArrowRight size={14} />
            </Link>
          </div>

          <div className="p-4 space-y-3 flex-1">
            <InvoiceReminderItem 
              client="Hôtel de la Plage" 
              amount="1 450 €" 
              daysLate={12} 
              status="CRITIQUE" 
            />
            <InvoiceReminderItem 
              client="M. Marchand" 
              amount="850 €" 
              daysLate={5} 
              status="RETARD" 
            />
            <InvoiceReminderItem 
              client="Sarl Batipro" 
              amount="2 100 €" 
              daysLate={0} 
              status="À VENIR" 
            />
          </div>
        </div>

        {/* 4. SECTION DEVIS RÉCENTS */}
        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
          <div className="p-6 border-b border-slate-50 flex justify-between items-center">
            <h3 className="text-lg font-bold text-slate-900">Derniers Devis</h3>
            <Link to="/devis" className="text-slate-400 hover:text-blue-600 transition-colors">
               <ArrowRight size={20} />
            </Link>
          </div>
          
          <div className="divide-y divide-slate-50">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400">
                        <FileText size={18} />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-slate-900">Projet Rénovation #{i}42</p>
                        <p className="text-xs text-slate-500 font-medium">Client #00{i}</p>
                    </div>
                </div>
                <span className="text-sm font-bold text-slate-700">950 €</span>
              </div>
            ))}
          </div>
          <div className="p-4 bg-slate-50/50 text-center">
             <Link to="/devis" className="text-xs font-bold text-slate-400 hover:text-blue-600 uppercase tracking-widest">
                Voir tout l'historique
             </Link>
          </div>
        </div>

      </div>
    </div>
  );
}

// --- SOUS-COMPOSANTS INTERNES ---

function StatCard({ title, value, trend, icon }: any) {
  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all group">
      <div className="flex justify-between items-start mb-4">
        <div className="p-3 bg-slate-50 rounded-2xl group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">{icon}</div>
        <span className="text-[10px] font-bold px-2 py-1 bg-slate-100 rounded-lg text-slate-500">{trend}</span>
      </div>
      <p className="text-slate-500 text-sm font-medium">{title}</p>
      <h4 className="text-2xl font-black text-slate-900 mt-1">{value}</h4>
    </div>
  );
}

function InvoiceReminderItem({ client, amount, daysLate, status }: any) {
  return (
    <div className="flex items-center justify-between p-4 rounded-2xl border border-slate-50 hover:border-blue-100 hover:bg-blue-50/30 transition-all group">
      <div className="flex items-center gap-4">
        <div className={`w-1.5 h-8 rounded-full ${
          status === 'CRITIQUE' ? 'bg-red-500' : status === 'RETARD' ? 'bg-amber-500' : 'bg-blue-500'
        }`} />
        <div>
          <p className="text-sm font-bold text-slate-900">{client}</p>
          <p className="text-[11px] text-slate-500 font-medium">
            {status === 'À VENIR' ? 'Échéance demain' : `${daysLate} jours de retard`}
          </p>
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        <span className="text-sm font-black text-slate-900">{amount}</span>
        <button className="flex items-center gap-2 bg-slate-900 text-white px-3 py-2 rounded-xl text-xs font-bold hover:bg-blue-600 transition-all opacity-0 group-hover:opacity-100 shadow-lg shadow-slate-200">
          <Send size={12} /> Relancer
        </button>
      </div>
    </div>
  );
}