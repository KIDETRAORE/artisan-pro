import { Routes, Route, Navigate } from "react-router-dom";
import PrivateRoute from "./auth/PrivateRoute";
import Layout from "./layout/Layout";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Vision from "./pages/Vision";
import Devis from "./pages/Devis";
import Compta from "./pages/Compta";

export default function App() {
  return (
    <Routes>
      {/* 🔓 Route publique */}
      <Route path="/login" element={<Login />} />

      {/* 🔐 Routes protégées */}
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        {/* Redirection par défaut */}
        <Route index element={<Navigate to="dashboard" replace />} />

        {/* Pages principales */}
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="vision" element={<Vision />} />
        <Route path="devis" element={<Devis />} />
        <Route path="compta" element={<Compta />} />
      </Route>

      {/* 🌍 404 globale (hors auth) */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}