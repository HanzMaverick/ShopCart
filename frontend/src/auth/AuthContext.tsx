import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { setUserRefreshedHandler, refreshSession } from '../api/http';
import { authApi, carritoApi } from '../api/endpoints';
import { cartToken, session } from '../api/session';
import type { Rol, Sesion, Usuario } from '../api/types';
import { useToast } from '../components/ui/Toast';

type Status = 'loading' | 'authenticated' | 'anonymous';

interface AuthValue {
  status: Status;
  user: Usuario | null;
  isStaff: boolean;
  hasRole: (...roles: Rol[]) => boolean;
  login: (correo: string, contrasena: string) => Promise<Usuario>;
  register: (b: { nombre: string; correo: string; contrasena: string }) => Promise<Usuario>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<Usuario | null>(null);
  const qc = useQueryClient();
  const toast = useToast();

  const apply = useCallback((u: Usuario) => { setUser(u); setStatus('authenticated'); }, []);

  useEffect(() => {
    // Si el cliente HTTP renueva el token (en segundo plano) mantiene sincronizado al usuario
    setUserRefreshedHandler(apply);
    // Sesion irrecuperable (refresh invalido/expirado/reutilizado): volver a anonimo; las rutas protegidas redirigen a /login
    session.setExpiredHandler(() => {
      setUser(null); setStatus('anonymous'); qc.clear();
      toast.info('Su sesion expiro. Inicie sesion nuevamente.');
    });

    // Restaurar sesion al cargar la pagina: el access token no persiste, el refresh token si
    void (async () => {
      if (!session.getRefresh()) { setStatus('anonymous'); return; }
      const result = await refreshSession();
      if (result === 'invalid') session.clear();
      if (result !== 'ok') setStatus('anonymous');
    })();

    return () => { setUserRefreshedHandler(null); session.setExpiredHandler(null); };
  }, [apply, qc, toast]);

  const startSession = useCallback(async (s: Sesion): Promise<Usuario> => {
    session.setTokens(s.accessToken, s.refreshToken);
    apply(s.usuario);
    // El carrito de invitado pasa a la cuenta del cliente
    const guest = cartToken.get();
    if (guest && s.usuario.rol === 'Cliente') {
      try { await carritoApi.fusionar(guest); } catch { /* si falla, el carrito del cliente sigue intacto */ }
    }
    cartToken.clear();
    await qc.invalidateQueries({ queryKey: ['carrito'] });
    return s.usuario;
  }, [apply, qc]);

  const login = useCallback(async (correo: string, contrasena: string) => startSession(await authApi.login(correo, contrasena)), [startSession]);
  const register = useCallback(async (b: { nombre: string; correo: string; contrasena: string }) => startSession(await authApi.register(b)), [startSession]);

  const logout = useCallback(async () => {
    const refresh = session.getRefresh();
    if (refresh) { try { await authApi.logout(refresh); } catch { /* se limpia igual en el cliente */ } }
    session.clear(); cartToken.clear();
    setUser(null); setStatus('anonymous');
    qc.clear();
  }, [qc]);

  const value = useMemo<AuthValue>(() => ({
    status, user,
    isStaff: user?.rol === 'Operador' || user?.rol === 'Administrador',
    hasRole: (...roles) => (user ? roles.includes(user.rol) : false),
    login, register, logout,
  }), [status, user, login, register, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}

/**Destino por defecto tras iniciar sesion segun el rol*/
export const homeFor = (rol: Rol): string => (rol === 'Administrador' ? '/admin/dashboard' : rol === 'Operador' ? '/admin/pedidos' : '/');
