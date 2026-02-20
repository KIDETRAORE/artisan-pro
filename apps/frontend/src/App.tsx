import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Calculator } from 'lucide-react'; // Import manquant précédemment
import { useAuth } from './store/auth.store';
import { useUser } from './context/user.context';
import Layout from './layout/Layout';
import Login from './pages/Login';
import Vision from './pages/Vision';
import Devis from './pages/Devis';

// ATTENTION : Le mot-clé "default" est CRUCIAL ici
export default function App() {
  const { user, accessToken } = useAuth();
  const { setUserData } = useUser();

  useEffect(() => {
    if (user?.email && accessToken) {
      const emailName = user.email.split('@')[0] || 'Artisan'; 
      const formattedName = emailName.charAt(0).toUpperCase() + emailName.slice(1);

      setUserData({
        name: formattedName,
        email: user.email,
        plan: 'PRO',
        quota: { used: 3, limit: 10 }
      });
    }
  }, [user, accessToken, setUserData]);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<Layout />}>
        <Route path="/vision" element={<Vision />} />
        <Route path="/devis" element={<Devis />} />
        
        {/* Route Compta intégrée directement */}
        <Route path="/compta" element={
          <div className="flex flex-col items-center justify-center h-[60vh] text-slate-400 space-y-4 font-sans">
            <Calculator size={48} className="opacity-20" />
            <p className="font-medium italic text-lg text-center">
              Espace Comptabilité <br/> 
              <span className="text-sm not-italic opacity-60">En cours de configuration...</span>
            </p>
          </div>
        } />
        
        {/* Redirections de nettoyage */}
        <Route path="/" element={<Navigate to="/vision" replace />} />
        <Route path="/dashboard" element={<Navigate to="/vision" replace />} />
        <Route path="/assistant" element={<Navigate to="/vision" replace />} />
        <Route path="/factures" element={<Navigate to="/devis" replace />} />
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}