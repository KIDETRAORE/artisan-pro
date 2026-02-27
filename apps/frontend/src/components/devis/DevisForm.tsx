import React, { useState } from 'react';
import { Save, Plus, Trash2, Calculator, Loader2 } from 'lucide-react';
import { DevisAiActions } from './DevisAiActions';
import { API_URL } from '../../config/api';
import { toast } from 'react-hot-toast';

// Définition de l'interface pour un article de devis
interface DevisItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

export const DevisForm = () => {
  // --- ÉTATS DU FORMULAIRE ---
  const [clientName, setClientName] = useState('');
  const [items, setItems] = useState<DevisItem[]>([
    { description: '', quantity: 1, unitPrice: 0 }
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- RÉCEPTION DES DONNÉES DE L'IA ---
  const handleAiAnalysis = (data: any) => {
    if (data.client) setClientName(data.client);
    
    if (data.items && Array.isArray(data.items)) {
      const formattedItems: DevisItem[] = data.items.map((item: any) => ({
        description: String(item.description || ''),
        quantity: Number(item.quantity) || 1,
        unitPrice: Number(item.unitPrice) || 0
      }));
      setItems(formattedItems);
      toast.success("Données extraites avec succès !");
    }
  };

  // --- GESTION DES ARTICLES ---
  const addItem = () => {
    setItems([...items, { description: '', quantity: 1, unitPrice: 0 }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    } else {
      toast.error("Le devis doit contenir au moins une ligne.");
    }
  };

  /**
   * Mise à jour d'un champ spécifique d'un article
   * Correction de l'erreur TS(2322) par reconstruction explicite de l'objet
   */
  const updateItem = (index: number, field: keyof DevisItem, value: string) => {
    const newItems = [...items];
    const currentItem = newItems[index];

    // On prépare la valeur (on convertit en nombre si c'est quantity ou unitPrice)
    const processedValue = (field === 'quantity' || field === 'unitPrice') 
      ? (parseFloat(value) || 0) 
      : value;

    // Reconstruction propre de l'objet pour satisfaire TypeScript
    newItems[index] = {
      ...currentItem,
      [field]: processedValue
    } as DevisItem;

    setItems(newItems);
  };

  const calculateTotal = () => {
    return items.reduce((acc, item) => acc + (Number(item.quantity) * Number(item.unitPrice)), 0);
  };

  // --- ENREGISTREMENT FINAL ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    const token = localStorage.getItem('token');

    try {
      const response = await fetch(`${API_URL}/devis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          clientName,
          items,
          total: calculateTotal(),
          createdAt: new Date().toISOString()
        })
      });

      if (!response.ok) throw new Error("Erreur serveur");

      toast.success("Devis enregistré !");
    } catch (error) {
      toast.error("Impossible d'enregistrer le devis");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8">
      <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
        
        {/* HEADER AVEC ACTIONS IA */}
        <div className="p-6 border-b border-slate-50 bg-slate-50/50 flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Nouveau Devis</h1>
            <p className="text-slate-500 text-sm">Remplissez les champs ou dictez votre devis</p>
          </div>
          <DevisAiActions onAnalysisComplete={handleAiAnalysis} />
        </div>

        <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-8">
          
          {/* SECTION CLIENT */}
          <div className="space-y-4">
            <label className="text-sm font-bold text-slate-700 uppercase tracking-widest">Client</label>
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-200 focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-medium"
              placeholder="Nom du client..."
              required
            />
          </div>

          {/* SECTION LIGNES DE DEVIS */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <label className="text-sm font-bold text-slate-700 uppercase tracking-widest">Détails de la prestation</label>
              <button
                type="button"
                onClick={addItem}
                className="text-sm font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 bg-blue-50 px-3 py-1 rounded-full transition-colors"
              >
                <Plus className="w-4 h-4" /> Ligne
              </button>
            </div>

            <div className="space-y-3">
              {items.map((item, index) => (
                <div key={index} className="group flex flex-col md:flex-row gap-3 p-4 rounded-2xl border border-slate-100 bg-white hover:border-blue-200 transition-all shadow-sm">
                  <div className="flex-[4]">
                    <input
                      type="text"
                      placeholder="Ex: Pose de carrelage salle de bain"
                      value={item.description}
                      onChange={(e) => updateItem(index, 'description', e.target.value)}
                      className="w-full bg-transparent font-medium outline-none text-slate-800"
                    />
                  </div>
                  
                  <div className="flex-[1] flex items-center gap-2 border-l md:pl-4 border-slate-100">
                    <span className="text-[10px] text-slate-400 font-bold md:hidden">Qté:</span>
                    <input
                      type="number"
                      step="any"
                      value={item.quantity}
                      onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                      className="w-full bg-transparent outline-none text-center font-bold"
                    />
                  </div>

                  <div className="flex-[2] flex items-center gap-2 border-l md:pl-4 border-slate-100">
                    <span className="text-[10px] text-slate-400 font-bold md:hidden">Prix:</span>
                    <input
                      type="number"
                      step="any"
                      value={item.unitPrice}
                      onChange={(e) => updateItem(index, 'unitPrice', e.target.value)}
                      className="w-full bg-transparent outline-none text-right font-black text-blue-600"
                    />
                    <span className="text-slate-400 font-bold">€</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                    title="Supprimer la ligne"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* TOTAL & SUBMIT */}
          <div className="pt-8 border-t border-slate-100 flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="bg-slate-900 rounded-2xl p-4 px-8 text-white flex items-center gap-4 shadow-xl">
              <Calculator className="w-6 h-6 text-blue-400" />
              <div>
                <p className="text-[10px] uppercase font-bold text-slate-400 leading-none mb-1">Total TTC</p>
                <p className="text-3xl font-black tracking-tighter">
                  {calculateTotal().toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                </p>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white px-12 py-5 rounded-2xl font-black text-xl shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-3 disabled:opacity-50 active:scale-95"
            >
              {isSubmitting ? (
                <Loader2 className="animate-spin w-6 h-6" />
              ) : (
                <Save className="w-6 h-6" />
              )}
              Enregistrer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};