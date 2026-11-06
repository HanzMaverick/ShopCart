import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type Tone = 'success' | 'error' | 'info';
interface ToastItem { id: number; tone: Tone; text: string }
interface ToastApi { success: (t: string) => void; error: (t: string) => void; info: (t: string) => void }

const ToastContext = createContext<ToastApi | null>(null);
let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((tone: Tone, text: string) => {
    const id = nextId++;
    setItems((prev) => [...prev, { id, tone, text }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), tone === 'error' ? 7000 : 4000);
  }, []);
  const api = useMemo<ToastApi>(() => ({ success: (t) => push('success', t), error: (t) => push('error', t), info: (t) => push('info', t) }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => <div key={t.id} className={`toast toast-${t.tone}`}>{t.text}</div>)}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de ToastProvider');
  return ctx;
}
