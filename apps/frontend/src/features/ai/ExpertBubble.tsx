import { useEffect } from "react";
import AiModePanel from "./AiModePanel";
import { useExpertAssistantStore } from "./expertAssistant.store";

export default function ExpertBubble() {
  const { isOpen, payload, close, open } = useExpertAssistantStore();

  // ✅ Si un payload arrive, on ouvre automatiquement la bulle
  useEffect(() => {
    if (payload) open();
  }, [payload, open]);

  return (
    <div className="fixed bottom-8 right-8 z-50">
      {isOpen && (
        <div className="mb-4 w-80 md:w-96">
          <AiModePanel />
        </div>
      )}

      <button
        onClick={() => (isOpen ? close() : open())}
        className="ml-auto w-16 h-16 bg-purple-600 text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all"
      >
        {isOpen ? "✕" : "✨"}
      </button>
    </div>
  );
}