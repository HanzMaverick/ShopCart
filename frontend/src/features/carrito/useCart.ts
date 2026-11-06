import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { carritoApi } from '../../api/endpoints';
import type { Carrito } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { errorMessage } from '../../lib/errors';

export const CART_KEY = ['carrito'] as const;

/** Carrito del invitado (token) o del cliente (JWT). El personal interno no tiene carrito. */
export function useCart() {
  const { status, isStaff } = useAuth();
  return useQuery({ queryKey: CART_KEY, queryFn: carritoApi.obtener, enabled: status !== 'loading' && !isStaff });
}

/** Mutaciones del carrito: el servidor devuelve el carrito completo y se usa como nuevo estado de la cache. */
export function useCartMutation<V>(fn: (v: V) => Promise<Carrito>, successMessage?: string) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: (cart) => { qc.setQueryData(CART_KEY, cart); if (successMessage) toast.success(successMessage); },
    onError: (e) => toast.error(errorMessage(e)),
  });
}
