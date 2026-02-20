import React, { useState, useRef } from 'react';
import { Upload, Image as ImageIcon, Wand2, Loader2, X, CheckCircle2 } from 'lucide-react';

export default function Vision() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setResult(null); // Reset du résultat précédent si on change d'image
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const resetImage = () => {
    setSelectedImage(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleAnalyze = async () => {
  if (!selectedImage) return;
  setIsAnalyzing(true);
  setResult(null);

  // Simulation d'une analyse haute précision
  setTimeout(() => {
    const expertReport = `
      ### 📋 RAPPORT D'EXPERTISE VISUELLE
      
      **1. Identification des structures :**
      - Type : Mur porteur en briques pleines (appareillage en boutisse).
      - État : Sain, mais présence d'efflorescences sur la partie inférieure gauche.
      
      **2. Analyse des surfaces :**
      - Surface brute calculée : 15.4 m²
      - Ouvertures détectées : Aucune sur ce pan.
      
      **3. Recommandations techniques :**
      - Nettoyage : Sablage basse pression ou brossage manuel.
      - Traitement : Application d'un hydrofuge de surface après rejointoiement.
      - Matériaux estimés : Environ 12 sacs de mortier de chaux (30kg) pour les joints.
      
      **4. Points de vigilance :**
      - Fissure capillaire à surveiller près de l'angle supérieur droit.
    `;
    setResult(expertReport);
    setIsAnalyzing(false);
  }, 2500);
};

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header Stylisé */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Vision AI</h2>
          <p className="text-slate-500 mt-2 text-lg">Métrés et diagnostics automatiques par analyse d'image.</p>
        </div>
        <div className="flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-2 rounded-full text-sm font-semibold border border-blue-100">
          <CheckCircle2 size={16} />
          Moteur Google Gemini Pro
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* COLONNE GAUCHE : UPLOAD */}
        <div className="space-y-4">
          <div className="bg-white p-2 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100">
            {!selectedImage ? (
              <label className="flex flex-col items-center justify-center w-full h-[400px] border-2 border-dashed border-slate-200 rounded-2xl cursor-pointer hover:bg-blue-50/50 hover:border-blue-400 transition-all group">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Upload size={32} />
                  </div>
                  <p className="text-lg text-slate-700 font-bold">Déposez votre photo</p>
                  <p className="text-sm text-slate-400 mt-1">ou cliquez pour parcourir</p>
                </div>
                <input 
                  type="file" 
                  ref={fileInputRef}
                  className="hidden" 
                  onChange={handleImageChange} 
                  accept="image/*" 
                />
              </label>
            ) : (
              <div className="relative h-[400px] w-full group">
                <img src={selectedImage} alt="Chantier" className="h-full w-full object-cover rounded-2xl" />
                <button 
                  onClick={resetImage}
                  className="absolute top-4 right-4 bg-white/90 p-2 rounded-full text-red-500 shadow-lg hover:bg-red-50 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            )}
          </div>

          <button 
            onClick={handleAnalyze}
            disabled={!selectedImage || isAnalyzing}
            className="w-full py-4 bg-slate-900 hover:bg-blue-600 disabled:bg-slate-300 text-white rounded-2xl font-bold flex items-center justify-center gap-3 transition-all transform active:scale-[0.98] shadow-xl shadow-blue-900/10"
          >
            {isAnalyzing ? <Loader2 className="animate-spin" /> : <Wand2 size={22} />}
            <span className="text-lg">{isAnalyzing ? "Analyse intelligente..." : "Lancer l'expertise AI"}</span>
          </button>
        </div>

        {/* COLONNE DROITE : RÉSULTATS */}
        <div className="flex flex-col h-full">
          <div className="bg-slate-900 rounded-3xl p-8 shadow-2xl flex-1 flex flex-col border border-slate-800 relative overflow-hidden">
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-blue-500/10 blur-[100px]" />
            
            <div className="flex items-center gap-3 mb-8 border-b border-slate-800 pb-6">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <ImageIcon className="text-blue-400" size={24} />
              </div>
              <h3 className="font-bold text-xl text-white">Rapport d'analyse</h3>
            </div>
            
            <div className="flex-1 overflow-y-auto">
              {result ? (
                <div className="space-y-6 animate-in slide-in-from-right-8 duration-500">
                  <div className="prose prose-invert">
                    <p className="text-slate-300 text-lg leading-relaxed italic">
                      "{result}"
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 mt-8">
                    <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50">
                      <span className="text-xs uppercase text-blue-400 font-bold tracking-wider">Surface Estimée</span>
                      <p className="text-2xl font-mono font-bold text-white mt-1">15.4 m²</p>
                    </div>
                    <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50">
                      <span className="text-xs uppercase text-blue-400 font-bold tracking-wider">Confiance</span>
                      <p className="text-2xl font-mono font-bold text-white mt-1">94%</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
                  <div className="w-20 h-20 border-2 border-dashed border-slate-800 rounded-full flex items-center justify-center text-slate-700">
                    <ImageIcon size={40} />
                  </div>
                  <p className="text-slate-500 max-w-[200px]">Uploadez une photo pour voir l'intelligence artificielle à l'œuvre.</p>
                </div>
              )}
            </div>

            <div className="mt-6 pt-6 border-t border-slate-800 text-[10px] text-slate-500 uppercase tracking-widest text-center">
              Propulsé par le moteur d'analyse ArtisanPro AI
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}