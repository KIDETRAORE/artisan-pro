import React, { useState, useEffect } from 'react';
import { Navigate } from "react-router-dom";
import { LayoutDashboard, Lock, Mail, ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from "../store/auth.store";

export default function Login() {
  const { user, accessToken, isLoading, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [forceShow, setForceShow] = useState(false);

  // Sécurité : Si le chargement dure plus de 2 secondes, on force l'affichage du formulaire
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isLoading) setForceShow(true);
    }, 2000);
    return () => clearTimeout(timer);
  }, [isLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await login(email, password);
    } catch (error) {
      alert("Erreur de connexion : identifiants incorrects.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 1. Redirection si déjà connecté
  if (user && accessToken) {
    return <Navigate to="/dashboard" replace />;
  }

  // 2. État de chargement (uniquement si pas forcé)
  if (isLoading && !forceShow) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center">
        <Loader2 className="animate-spin text-blue-600 mb-4" size={40} />
        <p className="text-slate-600 font-medium">Initialisation d'ArtisanPro...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl shadow-slate-200/60 overflow-hidden border border-slate-100 animate-in fade-in zoom-in duration-500">
        <div className="p-8">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200">
              <LayoutDashboard className="text-white" size={32} />
            </div>
          </div>
          
          <h2 className="text-2xl font-bold text-center text-slate-800 mb-2">ArtisanPro AI</h2>
          <p className="text-slate-500 text-center mb-8">Connectez-vous pour accéder à vos outils.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email professionnel</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 text-slate-400" size={18} />
                <input 
                  type="email" 
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all outline-none"
                  placeholder="artisan@exemple.fr"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Mot de passe</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 text-slate-400" size={18} />
                <input 
                  type="password" 
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all outline-none"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button 
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-100 flex items-center justify-center gap-2 group"
            >
              {isSubmitting ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                <>
                  Se connecter
                  <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>
        </div>
        
        <div className="bg-slate-50 p-4 border-t border-slate-100 text-center text-[10px] text-slate-400 uppercase tracking-widest">
          Sécurisé par ArtisanPro Cloud
        </div>
      </div>
    </div>
  );
}