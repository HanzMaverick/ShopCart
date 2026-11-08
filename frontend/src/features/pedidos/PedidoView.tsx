import type { ReactNode } from 'react';
import type { PedidoDetalle } from '../../api/types';
import { Badge, Card } from '../../components/ui/feedback';
import { atributosTexto, formatDateTime, formatQ } from '../../lib/format';
import { ESTADO_LABEL, ESTADO_TONE } from './estados';

export function EstadoBadge({ estado }: { estado: string }) {
  return <Badge tone={ESTADO_TONE[estado] ?? 'neutral'}>{ESTADO_LABEL[estado] ?? estado}</Badge>;
}

/** Vista de solo lectura de un pedido (la comparten el cliente y el panel interno). */
export function PedidoView({ detalle, showCliente, children }: { detalle: PedidoDetalle; showCliente?: boolean; children?: ReactNode }) {
  const { pedido: p, lineas, historial, pagos, devoluciones } = detalle;
  return (
    <div className="stack">
      <Card>
        <div className="row-between">
          <div>
            <h1 style={{ marginBottom: 0 }}>Pedido {p.numeroPedido}</h1>
            <span className="muted">{formatDateTime(p.fechaCreacion)}</span>
          </div>
          <EstadoBadge estado={p.estado} />
        </div>
        <div className="form-grid" style={{ marginTop: '1rem' }}>
          {showCliente && <div><strong className="small">Cliente</strong><br />{p.nombreCliente}<br /><span className="muted small">{p.correoCliente}</span></div>}
          <div><strong className="small">Entrega</strong><br />{p.direccionEnvio}<br /><span className="muted small">Tel. {p.telefonoContacto}</span></div>
          {p.codigoCupon && <div><strong className="small">Cupón</strong><br /><Badge tone="success">{p.codigoCupon}</Badge></div>}
        </div>
      </Card>

      {children}

      <Card>
        <h2>Productos</h2>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Producto</th><th className="num">Cant.</th><th className="num">Precio</th><th className="num">Descuento</th><th className="num">Subtotal</th><th className="num">Devuelto</th></tr></thead>
            <tbody>
              {lineas.map((l) => (
                <tr key={l.idPedidoDetalle}>
                  <td><strong>{l.nombreProducto}</strong><br /><span className="muted small">{atributosTexto(l.atributos)} · {l.sku}</span></td>
                  <td className="num">{l.cantidad}</td><td className="num">{formatQ(l.precioUnitario)}</td>
                  <td className="num">{l.descuentoLinea > 0 ? `−${formatQ(l.descuentoLinea)}` : '-'}</td>
                  <td className="num">{formatQ(l.subtotal)}</td><td className="num">{l.cantidadDevuelta || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ maxWidth: 320, marginLeft: 'auto', marginTop: '.75rem' }}>
          <div className="summary-row"><span>Subtotal</span><span>{formatQ(p.subtotal)}</span></div>
          {p.descuento > 0 && <div className="summary-row"><span>Descuento</span><span>−{formatQ(p.descuento)}</span></div>}
          <div className="summary-row summary-total"><span>Total</span><span>{formatQ(p.total)}</span></div>
          <p className="muted small">IVA (12 %) incluido: {formatQ(p.montoIVA)}</p>
        </div>
      </Card>

      <div className="dash-grid">
        <Card>
          <h2>Historial</h2>
          <ol className="stack-sm" style={{ paddingLeft: '1.1rem', margin: 0 }}>
            {historial.map((h) => (
              <li key={h.idPedidoHistorialEstado}>
                <strong>{ESTADO_LABEL[h.estadoNuevo] ?? h.estadoNuevo}</strong>{h.estadoAnterior ? <span className="muted small"> (desde {ESTADO_LABEL[h.estadoAnterior] ?? h.estadoAnterior})</span> : null}<br />
                <span className="muted small">{formatDateTime(h.fecha)} · {h.nombreUsuario}{h.comentario ? ` · ${h.comentario}` : ''}</span>
              </li>
            ))}
          </ol>
        </Card>
        <Card>
          <h2>Pagos y devoluciones</h2>
          <div className="stack-sm">
            {pagos.map((pg) => (
              <div key={pg.idPago} className="row-between">
                <span>{pg.estado === 'Reembolsado' ? 'Reembolso' : 'Pago'} · {pg.metodo}<br /><span className="muted small">{formatDateTime(pg.fecha)} · {pg.referencia}</span></span>
                <strong>{pg.estado === 'Reembolsado' ? '−' : ''}{formatQ(pg.monto)}</strong>
              </div>
            ))}
            {devoluciones.map((d) => (
              <div key={d.idDevolucion} className="small muted">Devolución #{d.idDevolucion}: {d.motivo} ({formatQ(d.montoReembolsado)}, {d.nombreUsuario})</div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
