import React from 'react';
import { 
  TrendingUp, 
  Users, 
  ClipboardCheck, 
  AlertCircle,
  ArrowUpRight,
  Plus
} from 'lucide-react';
import { useNavigate } from 'react-router-dom'; // <-- Ajouté pour la navigation
import { useUser } from '../context/user.context';

// Définition des types pour les composants internes
interface StatCardProps {
  title: string;
  value: string;
  trend: string;
  icon: React.ReactNode;
  color: string;
}

interface ProjectItemProps {
  name: string;
  status: 'En cours' | 'Terminé' | 'En attente';
  date: string;
  amount: string;
}

export default function Dashboard() {
  const { userData } = useUser();
  const navigate = useNavigate(); // <-- Initialisation du hook de navigation

  return (
    <div className="space-y-8">
      {/* 1. Header de bienvenue */}
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold text-slate-900">
            Bonjour, {userData?.name || 'Artisan'} 👋
          </h2>
          <p className="text-slate-500 mt-1">Voici ce qui se passe sur vos chantiers aujourd'hui.</p>
        </div>
        <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-semibold transition-all shadow-lg shadow-blue-200">
          <Plus size={20} />
          Nouveau Devis
        </button>
      </div>

      {/* 2. Cartes de Statistiques */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="CA Prévisionnel" 
          value="12 450 €" 
          trend="+12%" 
          icon={<TrendingUp className="text-emerald-600" size={24} />} 
          color="bg-emerald-50"
        />
        <StatCard 
          title="Chantiers Actifs" 
          value="8" 
          trend="En cours" 
          icon={<ClipboardCheck className="text-blue-600" size={24} />} 
          color="bg-blue-50"
        />
        <StatCard 
          title="Nouveaux Clients" 
          value="14" 
          trend="+3 cette semaine" 
          icon={<Users className="text-purple-600" size={24} />} 
          color="bg-purple-50"
        />
        <StatCard 
          title="Devis à relancer" 
          value="3" 
          trend="Urgent" 
          icon={<AlertCircle className="text-amber-600" size={24} />} 
          color="bg-amber-50"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* 3. Liste des derniers chantiers (Large) */}
        <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-50 flex justify-between items-center">
            <h3 className="font-bold text-slate-800">Chantiers récents</h3>
            <button className="text-blue-600 text-sm font-semibold hover:underline">Voir tout</button>
          </div>
          <div className="divide-y divide-slate-50">
            <ProjectItem name="Rénovation Cuisine - Villa Cap d'Ail" status="En cours" date="12 Fév 2026" amount="4 200 €" />
            <ProjectItem name="Installation Pompe à Chaleur" status="Terminé" date="10 Fév 2026" amount="8 500 €" />
            <ProjectItem name="Réfection Toiture Garage" status="En attente" date="08 Fév 2026" amount="2 100 €" />
          </div>
        </div>

        {/* 4. Raccourcis Vision AI (Petit) */}
        <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-3xl p-8 text-white shadow-xl shadow-blue-200 relative overflow-hidden">
          <div className="relative z-10">
            <h3 className="text-xl font-bold mb-2">Tester Vision AI</h3>
            <p className="text-blue-100 text-sm mb-6">Prenez une photo de vos fournitures pour générer un inventaire automatique.</p>
            <button 
              onClick={() => navigate('/vision')} 
              className="w-full bg-white text-blue-600 font-bold py-3 rounded-xl hover:bg-blue-50 transition-colors flex items-center justify-center gap-2 group"
            >
              Analyser une photo
              <ArrowUpRight size={18} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
            </button>
          </div>
          <div className="absolute -right-4 -bottom-4 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
        </div>
      </div>
    </div>
  );
}

const StatCard = ({ title, value, trend, icon, color }: StatCardProps) => (
  <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
    <div className={`w-12 h-12 ${color} rounded-2xl flex items-center justify-center mb-4`}>
      {icon}
    </div>
    <p className="text-sm font-medium text-slate-500">{title}</p>
    <div className="flex items-baseline gap-2 mt-1">
      <h4 className="text-2xl font-bold text-slate-900">{value}</h4>
      <span className="text-xs font-bold text-emerald-600">{trend}</span>
    </div>
  </div>
);

const ProjectItem = ({ name, status, date, amount }: ProjectItemProps) => (
  <div className="p-6 flex items-center justify-between hover:bg-slate-50 transition-colors">
    <div className="flex flex-col">
      <span className="font-semibold text-slate-800">{name}</span>
      <span className="text-sm text-slate-400">{date}</span>
    </div>
    <div className="flex items-center gap-6">
      <span className="text-sm font-bold text-slate-700">{amount}</span>
      <span className={`px-3 py-1 rounded-full text-xs font-bold ${
        status === 'En cours' ? 'bg-blue-100 text-blue-600' : 
        status === 'Terminé' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'
      }`}>
        {status}
      </span>
    </div>
  </div>
);