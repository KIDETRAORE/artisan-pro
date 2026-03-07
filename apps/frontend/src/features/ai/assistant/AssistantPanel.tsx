// apps/frontend/src/features/ai/assistant/AssistantPanel.tsx
import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Loader2 } from "lucide-react";
import { fetchWithAuth } from "../../../auth/fetchWithAuth";
import { useExpertAssistantStore } from "../expertAssistant.store";

interface Message {
  id: string;
  role: "assistant" | "user";
  content: string;
}

interface Props {
  variant?: "page" | "bubble";
}

export default function AssistantPanel({ variant = "page" }: Props) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Bonjour 👋 Je suis votre assistant expert.",
    },
  ]);

  const [analysisContext, setAnalysisContext] = useState<any>(null);

  const payload = useExpertAssistantStore((s) => s.payload);
  const clear = useExpertAssistantStore((s) => s.clear);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!payload) return;

    if (payload.analysisData) {
      setAnalysisContext(payload.analysisData);
    }

    if (payload.message != null) {
      setMessages((prev) => [
        ...prev,
        {
          id: `payload-${Date.now()}`,
          role: "assistant",
          content: payload.message ?? "",
        },
      ]);
    }

    clear();
  }, [payload, clear]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      let finalPrompt = input;
      if (analysisContext) {
        finalPrompt = `CONTEXTE COMPTA: ${JSON.stringify(
          analysisContext
        )}\n\nQUESTION: ${input}`;
      }

      const data = await fetchWithAuth<{ result?: string; jobId?: string }>(
        "/ai/chat",
        {
          method: "POST",
          body: JSON.stringify({
            type: "expert",
            prompt: finalPrompt,
            context: analysisContext ?? undefined,
          }),
        }
      );

      const botMsg: Message = {
        id: Date.now().toString(),
        role: "assistant",
        content: data?.result || "Réponse IA indisponible.",
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: "error",
          role: "assistant",
          content: "Erreur lors de la réponse IA.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={`flex flex-col ${
        variant === "bubble"
          ? "h-[500px]"
          : "h-[calc(100vh-140px)] max-w-4xl mx-auto"
      }`}
    >
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 bg-[var(--theme-bg)]"
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${
              msg.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`px-4 py-2 rounded-2xl text-sm ${
                msg.role === "user"
                  ? "bg-blue-600 text-white"
                  : "bg-[var(--theme-card)] border border-[var(--theme-border)]"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-[var(--theme-muted)] text-sm">
            <Loader2 size={16} className="animate-spin" />
            Réflexion en cours...
          </div>
        )}
      </div>

      <div className="p-3 border-t bg-[var(--theme-card)] flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Posez votre question..."
          className="flex-1 px-4 py-2 rounded-xl bg-[var(--theme-bg)] outline-none"
        />
        <button
          onClick={handleSend}
          className="bg-slate-900 text-white px-4 rounded-xl"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
