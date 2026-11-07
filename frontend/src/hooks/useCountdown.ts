import { useEffect, useState } from 'react';

/** Segundos restantes hasta `targetIso` (0 si ya paso o no hay fecha). Se actualiza cada segundo. */
export function useCountdown(targetIso: string | null | undefined): number {
  const calc = () => (targetIso ? Math.max(0, Math.floor((new Date(targetIso).getTime() - Date.now()) / 1000)) : 0);
  const [seconds, setSeconds] = useState(calc);
  useEffect(() => {
    setSeconds(calc());
    if (!targetIso) return undefined;
    const t = setInterval(() => setSeconds(calc()), 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetIso]);
  return seconds;
}

export const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
