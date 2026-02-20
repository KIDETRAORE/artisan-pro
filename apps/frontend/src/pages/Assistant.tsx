import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Bot, User, Paperclip, Loader2, Sparkles, Trash2 } from 'lucide-react';
import { useUser } from '../context/user.context';

// Définition de l'interface
interface Message {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  timestamp: Date;
}

export default function Assistant() {
  const { userData } = useUser();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Utilisation d'une fonction pour générer le message de bienvenue initial
  const getWelcomeMessage = useCallback((): Message => ({
    id: 'initial',
    role: 'assistant',
    content: `Bonjour ${userData?.name || 'Artisan'} ! Je suis votre assistant ArtisanPro. Je peux vous aider à calculer des surfaces, choisir des matériaux ou rédiger des descriptifs de travaux. Que puis-je faire pour vous ?`,
    timestamp: new Date()
  }), [userData?.name]);

  const [messages, setMessages] = useState<Message[]>([]);

  // Initialisation du premier message au montage
  useEffect(() => {
    setMessages([getWelcomeMessage()]);
  }, [getWelcomeMessage]);

  // Auto-scroll vers le bas
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [messages, isLoading]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    // Simulation de l'appel API Backend
    setTimeout(() => {
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `J'ai bien reçu votre demande concernant : "${userMsg.content}". Je suis prêt à être connecté à votre backend Java pour vous fournir une analyse technique détaillée.`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, botMsg]);
      setIsLoading(false);
    }, 1500);
  };

  return (
    <div className="max-w-4xl mx-auto h-[calc(100vh-180px)] flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-700">

      {/* Barre d'outils supérieure */}
      <div className="flex justify-between items-center mb-4 px-2">
        <div className="flex items-center gap-2">
          <Sparkles className="text-blue-500" size={18} />
          <span className="text-sm font-bold text-slate-600 uppercase tracking-wider">Expert AI Mode</span>
        </div>

        <button
          onClick={() => setMessages([getWelcomeMessage()])}
          className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-red-500 transition-colors"
        >
          <Trash2 size={14} /> Effacer la discussion
        </button>
      </div>

      <div className="flex-1 bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 flex flex-col overflow-hidden">

        {/* Zone des Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/30">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex gap-4 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${
                  msg.role === 'user' ? 'bg-white text-slate-600 border border-slate-200' : 'bg-slate-900 text-white'
                }`}>
                  {msg.role === 'user' ? <User size={20} /> : <Bot size={20} />}
                </div>
                <div className={`p-4 rounded-2xl text-sm leading-relaxed shadow-sm ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-tr-none'
                    : 'bg-white text-slate-700 border border-slate-100 rounded-tl-none'
                }`}>
                  {msg.content}
                </div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start animate-in fade-in duration-300">
              <div className="flex gap-4 items-center">
                <div className="w-10 h-10 rounded-2xl bg-slate-900 flex items-center justify-center text-white">
                  <Loader2 size={20} className="animate-spin" />
                </div>
                <div className="text-slate-400 text-xs font-medium italic">
                  ArtisanPro analyse votre demande...
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Zone de Saisie */}
        <div className="p-6 bg-white border-t border-slate-100">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Posez une question technique ou demandez un calcul..."
                className="w-full pl-6 pr-12 py-4 bg-slate-100 border-2 border-transparent focus:border-blue-500/20 focus:bg-white rounded-2xl transition-all text-sm outline-none"
              />
              <button className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-600 transition-colors">
                <Paperclip size={20} />
              </button>
            </div>
            <button
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              className="p-4 bg-slate-900 text-white rounded-2xl hover:bg-blue-600 disabled:bg-slate-200 transition-all shadow-lg active:scale-95"
            >
              <Send size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}