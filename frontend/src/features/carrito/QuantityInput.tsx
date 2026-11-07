import { useEffect, useState } from 'react';

interface Props { value: number; min?: number; max: number; onChange: (n: number) => void; disabled?: boolean; label?: string }

/** Selector de cantidad: botones +/- y escritura directa (se confirma al salir del campo). */
export function QuantityInput({ value, min = 1, max, onChange, disabled, label = 'Cantidad' }: Props) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const clamp = (n: number) => Math.min(Math.max(Number.isFinite(n) ? Math.trunc(n) : min, min), max);
  const commit = () => { const n = clamp(Number(text)); setText(String(n)); if (n !== value) onChange(n); };

  return (
    <div className="qty" role="group" aria-label={label}>
      <button type="button" aria-label="Disminuir" disabled={disabled || value <= min} onClick={() => onChange(clamp(value - 1))}>−</button>
      <input inputMode="numeric" aria-label={label} value={text} disabled={disabled} onChange={(e) => setText(e.target.value.replace(/\D/g, ''))}
             onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); }} />
      <button type="button" aria-label="Aumentar" disabled={disabled || value >= max} onClick={() => onChange(clamp(value + 1))}>+</button>
    </div>
  );
}
