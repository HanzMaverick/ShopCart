import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

type Tone = 'success' | 'error' | 'info';
interface ToastItem { id: number; tone: Tone; text: string }
interface ToastApi { success: (t: string) => void; error: (t: string) => void; info: (t: string) => void }

const ToastContext = createContext<ToastApi | null>(null);
let nextId = 1;

const ICON: Record<Tone, string> = { success: '✓', error: '✕', info: 'i' };
const DURATION: Record<Tone, number> = { success: 2000, info: 4000, error: 9000 };   // los errores permanecen mas tiempo
const MAX_VISIBLE = 4;

/**Una notificacion: se cierra sola, con la X, y se pausa mientras el cursor esta encima (para poder leerla con calma)*/
function ToastView({ item, onClose }: { item: ToastItem; onClose: (id: number) => void }) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return undefined;
    const t = setTimeout(() => onClose(item.id), DURATION[item.tone]);
    return () => clearTimeout(t);
  }, [paused, item.id, item.tone, onClose]);

  return (
    <div className={`toast toast-${item.tone}`} role={item.tone === 'error' ? 'alert' : 'status'}
         onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <span className="toast-icon" aria-hidden="true">{ICON[item.tone]}</span>
      <span>{item.text}</span>
      <button type="button" className="toast-close" aria-label="Cerrar notificación" onClick={() => onClose(item.id)}>×</button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const close = useCallback((id: number) => setItems((prev) => prev.filter((t) => t.id !== id)), []);
  const push = useCallback((tone: Tone, text: string) => {
    setItems((prev) => [...prev, { id: nextId++, tone, text }].slice(-MAX_VISIBLE));
  }, []);
  const api = useMemo<ToastApi>(() => ({ success: (t) => push('success', t), error: (t) => push('error', t), info: (t) => push('info', t) }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => <ToastView key={t.id} item={t} onClose={close} />)}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de ToastProvider');
  return ctx;
}
