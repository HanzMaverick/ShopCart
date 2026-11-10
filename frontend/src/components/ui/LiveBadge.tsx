import { useAuth } from '../../auth/AuthContext';
import { useRealtimeStatus } from '../../realtime/RealtimeProvider';

const TEXTO = { 'en-vivo': 'En tiempo real', conectando: 'Conectando...', reconectando: 'Reconectando...' } as const;

/**Indicador de que la pantalla se actualiza sola*/
export function LiveBadge() {
  const { user } = useAuth();
  const estado = useRealtimeStatus();
  if (!user) return null;
  return (
    <span className={`live live-${estado}`} role="status" title={estado === 'en-vivo' ? 'Los cambios aparecen sin recargar la página' : 'Se intentará reconectar automaticamente'}>
      <span className="live-dot" aria-hidden="true" />{TEXTO[estado]}
    </span>
  );
}
