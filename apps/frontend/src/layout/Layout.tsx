import React from 'react';
import { useLocation, useNavigate, Link, Outlet } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Image, 
  MessageSquare, 
  Receipt, 
  LogOut 
} from 'lucide-react';
import { useAuth } from '../store/auth.store';
import { useUser } from '../context/user.context';
import { Topbar } from './Topbar'; // <-- ON IMPORTE LA VRAIE TOPBAR ICI

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { clearUserData } = useUser();

  const handleLogout = async () => {
    await logout();
    clearUserData();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* SIDEBAR */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col shrink-0">
        <div className="p-8 text-xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent italic">
          ArtisanPro AI
        </div>
        
        <nav className="flex-1 px-4 space-y-2">
          <Link to="/dashboard">
            <NavItem 
              icon={<LayoutDashboard size={20} />} 
              label="Dashboard" 
              active={location.pathname === '/dashboard'} 
            />
          </Link>
          <Link to="/vision">
            <NavItem 
              icon={<Image size={20} />} 
              label="Vision AI" 
              active={location.pathname === '/vision'} 
            />
          </Link>
          <Link to="/assistant">
            <NavItem 
              icon={<MessageSquare size={20} />} 
              label="Assistant" 
              active={location.pathname === '/assistant'} 
            />
          </Link>
          <Link to="/devis">
            <NavItem 
              icon={<Receipt size={20} />} 
              label="Devis & Factures" 
              active={location.pathname === '/devis'} 
            />
          </Link>
        </nav>

        {/* Bouton déconnexion en bas de sidebar (optionnel car présent en haut aussi) */}
        <div className="p-4 border-t border-slate-800">
          <button 
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-all w-full text-left group"
          >
            <LogOut size={20} className="group-hover:-translate-x-1 transition-transform" />
            <span className="font-medium">Déconnexion</span>
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* APPEL DE LA TOPBAR DYNAMIQUE */}
        <Topbar /> 

        {/* ZONE DE CONTENU DYNAMIQUE */}
        <div className="flex-1 overflow-y-auto p-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
          <Outlet /> 
        </div>
      </main>
    </div>
  );
}

// Composant interne pour les liens du menu
const NavItem = ({ icon, label, active = false }: { icon: React.ReactNode, label: string, active?: boolean }) => (
  <div className={`flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all duration-300 ${
    active 
      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20 scale-[1.02]' 
      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
  }`}>
    {icon}
    <span className="font-medium">{label}</span>
  </div>
);