import { useEffect, useState } from "react";
import { useAiAssistant } from "./useAiAssistant";

export default function AiModePanel() {
  const { data, loading, error, fetchStrategy, fetchForecast, triggerAutomation } = useAiAssistant();
  const [confirmed, setConfirmed] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetchStrategy();
    fetchForecast();
  }, []);

  const handleLaunch = async () => {
    const success = await triggerAutomation();
    if (success) setDone(true);
  };

  return (
    <div className="p-6 bg-white border shadow-xl rounded-2xl space-y-4 text-gray-800">
      <h2 className="text-xl font-bold flex items-center gap-2">
        ✨ Expert IA <span className="text-xs bg-purple-100 text-purple-600 px-2 py-1 rounded">BETA</span>
      </h2>

      {loading && <p className="text-sm text-gray-500 animate-pulse">Analyse de vos factures...</p>}
      
      {data?.forecast && (
        <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
          <p className="text-sm text-gray-500 font-medium uppercase tracking-wider">Trésorerie attendue (30j)</p>
          <p className="text-3xl font-black text-gray-900">{data.forecast.expectedNext30Days} €</p>
        </div>
      )}

      {data?.advice && (
        <div className="bg-purple-50 p-4 rounded-xl border border-purple-100">
          <h3 className="text-xs font-bold text-purple-700 uppercase mb-2">Conseils stratégiques</h3>
          <p className="text-sm italic leading-relaxed text-gray-700">"{data.advice}"</p>
        </div>
      )}

      {!done ? (
        <div className="pt-2">
          {!confirmed ? (
            <button
              onClick={() => setConfirmed(true)}
              className="w-full bg-purple-600 text-white py-3 rounded-xl font-bold hover:bg-purple-700 transition-colors shadow-lg shadow-purple-200"
            >
              Suivre les recommandations
            </button>
          ) : (
            <button
              onClick={handleLaunch}
              className="w-full bg-green-600 text-white py-3 rounded-xl font-bold hover:bg-green-700 transition-colors animate-bounce"
            >
              🚀 Lancer les relances IA
            </button>
          )}
        </div>
      ) : (
        <div className="p-3 bg-green-100 text-green-700 text-center rounded-lg font-bold">
          ✅ Relances envoyées !
        </div>
      )}
    </div>
  );
}