import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { connectEvents } from '../api/stream';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/ui/Toast';
import { ESTADO_LABEL } from '../features/pedidos/estados';

export type EstadoEnVivo = 'conectando' | 'en-vivo' | 'reconectando';
const RealtimeContext = createContext<EstadoEnVivo>('conectando');
export const useRealtimeStatus = () => useContext(RealtimeContext);

/**Que datos en cache se vuelven a pedir según el rol (el servidor solo avisa; la API sigue siendo la fuente de verdad)*/
const CLAVES: Record<string, string[]> = { Cliente: ['pedidos'], Operador: ['pedidos', 'inventario'], Administrador: ['pedidos', 'inventario', 'reportes'] };

/**
 * Tiempo real: una sola conexion SSE por pestaña mientras haya sesión. Cada evento invalida (con un pequeño retardo para agrupar
 * ráfagas) las consultas afectadas, de modo que pantallas abiertas -dashboard, listas y detalle de pedidos- se actualizan solas.
 * Al reconectar tras una caida tambien se refresca todo, para recuperar lo que pudo perderse.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [estado, setEstado] = useState<EstadoEnVivo>('conectando');

  useEffect(() => {
    if (!user) return undefined;
    const yo = user.idUsuario;
    const rol = user.rol;
    const claves = CLAVES[rol] ?? ['pedidos'];
    let pendientes = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let primeraConexion = true;

    const refrescar = () => {
      claves.forEach((k) => pendientes.add(k));
      timer ??= setTimeout(() => {
        pendientes.forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
        pendientes = new Set();
        timer = null;
      }, 500);
    };

    setEstado('conectando');
    const detener = connectEvents({
      onOpen: () => { setEstado('en-vivo'); if (!primeraConexion) refrescar(); primeraConexion = false; },
      onClose: () => setEstado('reconectando'),
      onEvent: (e) => {
        refrescar();
        if (e.idActor === yo) return;                          // quien hizo el cambio ya lo ve: no se le avisa
        const nombreEstado = ESTADO_LABEL[e.estado] ?? e.estado;
        if (rol === 'Cliente') toast.info(`Su pedido ${e.numeroPedido} ahora esta: ${nombreEstado}`);
        else if (e.tipo === 'pedido.creado') toast.info(`Nuevo pedido ${e.numeroPedido}`);
        else toast.info(`Pedido ${e.numeroPedido}: ${nombreEstado}`);
      },
    });
    return () => { detener(); if (timer) clearTimeout(timer); };
  }, [user, qc, toast]);

  return <RealtimeContext.Provider value={estado}>{children}</RealtimeContext.Provider>;
}
