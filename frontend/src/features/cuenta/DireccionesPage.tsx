import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { direccionesApi } from '../../api/endpoints';
import type { Direccion } from '../../api/types';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog, Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { Card, EmptyState, ErrorState, PageHeader, Skeleton } from '../../components/ui/feedback';
import { errorMessage } from '../../lib/errors';
import { DireccionForm } from './DireccionForm';

export const DIRECCIONES_KEY = ['direcciones'] as const;
export function useDirecciones() { return useQuery({ queryKey: DIRECCIONES_KEY, queryFn: direccionesApi.listar }); }

export function DireccionesPage() {
  const q = useDirecciones();
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<Direccion | 'nueva' | null>(null);
  const [deleting, setDeleting] = useState<Direccion | null>(null);

  const remove = useMutation({
    mutationFn: (id: number) => direccionesApi.eliminar(id),
    onSuccess: () => { toast.success('Dirección eliminada'); setDeleting(null); return qc.invalidateQueries({ queryKey: DIRECCIONES_KEY }); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <>
      <PageHeader title="Mis direcciones" subtitle="Direcciones de entrega" actions={<Button onClick={() => setEditing('nueva')}>Nueva dirección</Button>} />
      {q.isPending && <div className="stack"><Skeleton height={80} /><Skeleton height={80} /></div>}
      {q.isError && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      {q.data?.length === 0 && <Card><EmptyState title="Aun no tiene direcciones" description="Agregue una para poder comprar." action={<Button onClick={() => setEditing('nueva')}>Agregar direccion</Button>} /></Card>}
      <div className="dash-grid">
        {q.data?.map((d) => (
          <Card key={d.idDireccion}>
            <h3>{d.alias}</h3>
            <p className="muted">{d.linea1}{d.linea2 ? `, ${d.linea2}` : ''}<br />{d.ciudad}, {d.departamento}<br />Tel. {d.telefono}</p>
            <div className="row">
              <Button size="sm" variant="secondary" onClick={() => setEditing(d)}>Editar</Button>
              <Button size="sm" variant="ghost" onClick={() => setDeleting(d)}>Eliminar</Button>
            </div>
          </Card>
        ))}
      </div>

      {editing && (
        <Modal title={editing === 'nueva' ? 'Nueva dirección' : 'Editar dirección'} onClose={() => setEditing(null)}>
          <DireccionForm
            initial={editing === 'nueva' ? undefined : editing}
            onCancel={() => setEditing(null)}
            onSubmit={async (d) => {
              if (editing === 'nueva') await direccionesApi.crear(d); else await direccionesApi.actualizar(editing.idDireccion, d);
              toast.success('Dirección guardada');
              setEditing(null);
              await qc.invalidateQueries({ queryKey: DIRECCIONES_KEY });
            }}
          />
        </Modal>
      )}
      {deleting && (
        <ConfirmDialog title="Eliminar dirección" danger loading={remove.isPending} confirmLabel="Eliminar"
          message={<>¿Eliminar la dirección <strong>{deleting.alias}</strong>? Los pedidos anteriores conservan su dirección.</>}
          onConfirm={() => remove.mutate(deleting.idDireccion)} onCancel={() => setDeleting(null)} />
      )}
    </>
  );
}
