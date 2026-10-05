import { CircleCheck, CircleAlert } from "lucide-react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

interface Toast {
  id: number;
  text: string;
  kind: "ok" | "error";
}
const Ctx = createContext<(text: string, kind?: "ok" | "error") => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: "ok" | "error" = "ok") => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, text, kind }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), kind === "error" ? 6000 : 3800);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="toast">
            {t.kind === "ok" ? <CircleCheck aria-hidden /> : <CircleAlert aria-hidden />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
