import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { adminApi } from '../../api/admin';
import type { BitacoraFila } from '../../api/types';
import { Button } from '../../components/ui/Button';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { Modal } from '../../components/ui/Modal';
import { SelectField } from '../../components/ui/fields';
import { Alert, Badge, Card, PageHeader } from '../../components/ui/feedback';
import { useUrlState } from '../../hooks/useUrlState';
import { formatDateTime } from '../../lib/format';

const MODULOS = ['Catalogo', 'Precios', 'Inventario', 'Cupones', 'Pedidos', 'Usuarios'];
const ACCION_TONE = { Creacion: 'success', Modificacion: 'info', Desactivacion: 'warning', Eliminacion: 'danger' } as const;
const mostrar = (v: unknown) => (v === undefined ? '-' : typeof v === 'string' ? v : JSON.stringify(v));

/**Compara el valor anterior y el nuevo campo por campo y resalta lo que cambio*/
function CambiosModal({ fila, onClose }: { fila: BitacoraFila; onClose: () => void }) {
  const antes = fila.valorAnterior ?? {};
  const despues = fila.valorNuevo ?? {};
  const campos = [...new Set([...Object.keys(antes), ...Object.keys(despues)])];
  return (
    <Modal title={`${fila.accion} · ${fila.entidad} #${fila.idEntidad}`} wide onClose={onClose}>
      <p className="muted small">{formatDateTime(fila.fecha)} · {fila.nombreUsuario} · Modulo {fila.modulo}</p>
      {campos.length === 0 ? <Alert tone="info">Este registro no guardo valores.</Alert> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Campo</th><th>Antes</th><th>Despues</th></tr></thead>
            <tbody>
              {campos.map((c) => {
                const cambio = JSON.stringify(antes[c]) !== JSON.stringify(despues[c]);
                return (
                  <tr key={c} style={cambio ? { background: 'var(--warning-50)' } : undefined}>
                    <td><strong>{c}</strong></td><td><code>{mostrar(antes[c])}</code></td><td><code>{mostrar(despues[c])}</code></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

export default function BitacoraPage() {
  const url = useUrlState();
  const [detalle, setDetalle] = useState<BitacoraFila | null>(null);
  const filtros = { modulo: url.get('modulo'), page: url.page, pageSize: 20 };
  const q = useQuery({ queryKey: ['admin', 'bitacora', filtros], queryFn: () => adminApi.bitacora.listar(filtros), placeholderData: keepPreviousData });

  const cols: Column<BitacoraFila>[] = [
    { key: 'f', header: 'Fecha', cell: (b) => formatDateTime(b.fecha) },
    { key: 'm', header: 'Modulo', cell: (b) => <Badge tone="primary">{b.modulo}</Badge> },
    { key: 'e', header: 'Entidad', cell: (b) => <>{b.entidad} <span className="muted">#{b.idEntidad}</span></> },
    { key: 'a', header: 'Accion', cell: (b) => <Badge tone={ACCION_TONE[b.accion as keyof typeof ACCION_TONE] ?? 'neutral'}>{b.accion}</Badge> },
    { key: 'u', header: 'Usuario', cell: (b) => b.nombreUsuario },
    { key: 'd', header: '', cell: (b) => <Button size="sm" variant="secondary" onClick={() => setDetalle(b)}>Ver cambios</Button> },
  ];

  return (
    <>
      <PageHeader title="Bitacora" subtitle="Registro de solo lectura: quien cambio precios, existencias, cupones, pedidos y mas. No puede modificarse ni eliminarse." />
      <div className="stack">
        <Card className="card-flat">
          <div className="filters">
            <SelectField label="Modulo" value={url.get('modulo') ?? ''} onChange={(e) => url.set({ modulo: e.target.value })}>
              <option value="">Todos</option>{MODULOS.map((m) => <option key={m} value={m}>{m}</option>)}
            </SelectField>
          </div>
        </Card>
        <DataTable columns={cols} rows={q.data?.data} rowKey={(b) => b.idBitacora} loading={q.isPending} fetching={q.isFetching} error={q.error} onRetry={() => void q.refetch()}
                   pagination={q.data?.pagination} onPageChange={(page) => url.set({ page })} emptyTitle="Sin registros" emptyDescription="No hay movimientos para ese modulo." />
      </div>
      {detalle && <CambiosModal fila={detalle} onClose={() => setDetalle(null)} />}
    </>
  );
}
