import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './store/auth.store';
import { useUser } from './context/user.context';
import Layout from './layout/Layout';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Vision from './pages/Vision'; // <-- On importe le vrai composant maintenant

export default function App() {
  const { user, accessToken } = useAuth();
  const { setUserData } = useUser();

  /**
   * SYNCHRONISATION
   * On injecte les infos de Supabase dans le contexte utilisateur
   */
  useEffect(() => {
    if (user?.email && accessToken) {
      const parts = user.email.split('@');
      const emailName = parts[0];

      if (emailName) {
        const formattedName = emailName.charAt(0).toUpperCase() + emailName.slice(1);

        setUserData({
          name: formattedName,
          email: user.email,
          plan: 'PRO',
          quota: { used: 0, limit: 10 }
        });
      }
    }
  }, [user, accessToken, setUserData]);

  return (
    <Routes>
      {/* 1. Page de Login (Indépendante) */}
      <Route path="/login" element={<Login />} />

      {/* 2. Routes avec Sidebar & Header */}
      <Route element={<Layout />}>
        {/* Dashboard principal */}
        <Route path="/dashboard" element={<Dashboard />} />
        
        {/* Module Vision AI (Connecté !) */}
        <Route path="/vision" element={<Vision />} />
        
        {/* Pages restantes en construction */}
        <Route path="/assistant" element={
          <div className="p-8 bg-white rounded-3xl border border-slate-100 shadow-sm text-slate-600 font-medium">
            💬 Assistant Personnel : Configuration du Chatbot...
          </div>
        } />
        
        <Route path="/devis" element={
          <div className="p-8 bg-white rounded-3xl border border-slate-100 shadow-sm text-slate-600 font-medium">
            📄 Devis & Factures : Système de génération PDF...
          </div>
        } />
        
        {/* Redirection vers le dashboard par défaut */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Route>

      {/* 3. Redirection de secours */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}