import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './store/auth.store';
import { useUser } from './context/user.context';
import Layout from './layout/Layout';
import Login from './pages/Login';
import Vision from './pages/Vision';
import Devis from './pages/Devis';
import Compta from './pages/Compta'; // <-- 1. ON IMPORTE TON COMPOSANT

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
      {/* 1. Route Publique */}
      <Route 
        path="/login" 
        element={!accessToken ? <Login /> : <Navigate to="/vision" replace />} 
      />

      {/* 2. Groupe de Routes Protégées */}
      <Route element={accessToken ? <Layout /> : <Navigate to="/login" replace />}>
        
        <Route path="/vision" element={<Vision />} />
        <Route path="/devis" element={<Devis />} />
        
        {/* 2. ON REMPLACE LE PLACEHOLDER PAR LE VRAI COMPOSANT COMPTA */}
        <Route path="/compta" element={<Compta />} />
        
        {/* Redirections internes */}
        <Route path="/" element={<Navigate to="/vision" replace />} />
        <Route path="/dashboard" element={<Navigate to="/vision" replace />} />
        <Route path="/assistant" element={<Navigate to="/vision" replace />} />
        <Route path="/factures" element={<Navigate to="/devis" replace />} />
      </Route>

      {/* 3. Fallback */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}