import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from './Button';

interface ModalProps { title: string; onClose: () => void; children: ReactNode; wide?: boolean }

export function Modal({ title, onClose, children, wide }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input, select, textarea, button:not([data-close])')?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previous?.focus(); };
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal${wide ? ' modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="modal-head">
          <h2>{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Cerrar" data-close>x</Button>
        </div>
        {children}
      </div>
    </div>
  );
}

interface ConfirmProps { title: string; message: ReactNode; confirmLabel?: string; danger?: boolean; loading?: boolean; onConfirm: () => void; onCancel: () => void }

export function ConfirmDialog({ title, message, confirmLabel = 'Confirmar', danger, loading, onConfirm, onCancel }: ConfirmProps) {
  return (
    <Modal title={title} onClose={onCancel}>
      <div>{message}</div>
      <div className="modal-actions">
        <Button variant="secondary" onClick={onCancel} disabled={loading}>Cancelar</Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}
