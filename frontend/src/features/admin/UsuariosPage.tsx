import { zodResolver } from '@hookform/resolvers/zod';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { adminApi } from '../../api/admin';
import type { Rol, UsuarioFila } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../../components/ui/Button';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { ConfirmDialog, Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { SelectField, TextField } from '../../components/ui/fields';
import { Alert, Badge, Card, PageHeader } from '../../components/ui/feedback';
import { useUrlState, useUrlTextField } from '../../hooks/useUrlState';
import { applyServerErrors, errorMessage } from '../../lib/errors';
import { formatDate } from '../../lib/format';
import { usuarioSchema, type UsuarioForm } from '../../lib/schemas';

const ROLES: { id: number; nombre: Rol }[] = [{ id: 1, nombre: 'Cliente' }, { id: 2, nombre: 'Operador' }, { id: 3, nombre: 'Administrador' }];
const ROL_TONE = { Cliente: 'neutral', Operador: 'info', Administrador: 'primary' } as const;

function UsuarioModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<unknown> }) {
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<UsuarioForm>({
    resolver: zodResolver(usuarioSchema), defaultValues: { idRol: 2, nombre: '', correo: '', contrasena: '' },
  });
  const submit = handleSubmit(async (v) => {
    setFormError(null);
    try { await adminApi.usuarios.crear(v); toast.success('Usuario creado'); await onSaved(); onClose(); }
    catch (e) { if (!applyServerErrors(e, setError, ['idRol', 'nombre', 'correo', 'contrasena'])) setFormError(errorMessage(e)); }
  });
  return (
    <Modal title="Nuevo usuario" onClose={onClose}>
      <form className="stack" onSubmit={submit} noValidate>
        {formError && <Alert tone="error">{formError}</Alert>}
        <SelectField label="Rol" error={errors.idRol?.message} {...register('idRol', { valueAsNumber: true })}>
          {ROLES.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
        </SelectField>
        <TextField label="Nombre completo" error={errors.nombre?.message} {...register('nombre')} />
        <TextField label="Correo" type="email" autoComplete="off" error={errors.correo?.message} {...register('correo')} />
        <TextField label="Contraseña inicial" type="password" autoComplete="new-password" hint="Minimo 8 caracteres, con letras y numeros." error={errors.contrasena?.message} {...register('contrasena')} />
        <div className="modal-actions"><Button variant="secondary" onClick={onClose} disabled={isSubmitting}>Cancelar</Button><Button type="submit" loading={isSubmitting}>Crear usuario</Button></div>
      </form>
    </Modal>
  );
}

export default function UsuariosPage() {
  const url = useUrlState();
  const qc = useQueryClient();
  const toast = useToast();
  const { user: yo } = useAuth();
  const [busqueda, setBusqueda] = useUrlTextField(url, 'busqueda');
  const [creating, setCreating] = useState(false);
  const [desactivando, setDesactivando] = useState<UsuarioFila | null>(null);
  const activoParam = url.get('activo');
  const filtros = { busqueda: url.get('busqueda'), idRol: url.getNum('rol'), activo: activoParam === 'true' ? true : activoParam === 'false' ? false : undefined, page: url.page, pageSize: 15 };
  const q = useQuery({ queryKey: ['admin', 'usuarios', filtros], queryFn: () => adminApi.usuarios.listar(filtros), placeholderData: keepPreviousData });
  const refrescar = () => qc.invalidateQueries({ queryKey: ['admin', 'usuarios'] });

  const cambiar = useMutation({
    mutationFn: (u: UsuarioFila) => adminApi.usuarios.cambiarEstado(u.idUsuario, !u.activo),
    onSuccess: async (r) => { toast.success(r.activo ? 'Usuario activado' : 'Usuario desactivado: sus sesiones se cerraron'); setDesactivando(null); await refrescar(); },
    onError: (e) => { toast.error(errorMessage(e)); setDesactivando(null); },
  });

  const cols: Column<UsuarioFila>[] = [
    { key: 'n', header: 'Usuario', cell: (u) => <><strong>{u.nombre}</strong><br /><span className="muted small">{u.correo}</span></> },
    { key: 'r', header: 'Rol', cell: (u) => <Badge tone={ROL_TONE[u.rol]}>{u.rol}</Badge> },
    { key: 'e', header: 'Estado', cell: (u) => (u.activo ? <Badge tone="success">Activo</Badge> : <Badge tone="danger">Desactivado</Badge>) },
    { key: 'f', header: 'Alta', cell: (u) => formatDate(u.fechaCreacion) },
    { key: 'a', header: '', cell: (u) => (u.idUsuario === yo?.idUsuario ? <span className="muted small">Su cuenta</span> : (
      <Button size="sm" variant={u.activo ? 'ghost' : 'secondary'} loading={cambiar.isPending && cambiar.variables?.idUsuario === u.idUsuario}
              onClick={() => (u.activo ? setDesactivando(u) : cambiar.mutate(u))}>{u.activo ? 'Desactivar' : 'Activar'}</Button>)) },
  ];

  return (
    <>
      <PageHeader title="Usuarios" subtitle="Los usuarios se desactivan, no se borran." actions={<Button onClick={() => setCreating(true)}>Nuevo usuario</Button>} />
      <div className="stack">
        <Card className="card-flat">
          <div className="filters">
            <TextField label="Buscar" type="search" placeholder="Nombre o correo" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
            <SelectField label="Rol" value={url.get('rol') ?? ''} onChange={(e) => url.set({ rol: e.target.value })}>
              <option value="">Todos</option>{ROLES.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
            </SelectField>
            <SelectField label="Estado" value={activoParam ?? ''} onChange={(e) => url.set({ activo: e.target.value })}>
              <option value="">Todos</option><option value="true">Activos</option><option value="false">Desactivados</option>
            </SelectField>
          </div>
        </Card>
        <DataTable columns={cols} rows={q.data?.data} rowKey={(u) => u.idUsuario} loading={q.isPending} fetching={q.isFetching} error={q.error} onRetry={() => void q.refetch()}
                   pagination={q.data?.pagination} onPageChange={(page) => url.set({ page })} emptyTitle="No hay usuarios con esos filtros" />
      </div>
      {creating && <UsuarioModal onClose={() => setCreating(false)} onSaved={refrescar} />}
      {desactivando && (
        <ConfirmDialog title="Desactivar usuario" danger confirmLabel="Desactivar" loading={cambiar.isPending}
          message={<>¿Desactivar a <strong>{desactivando.nombre}</strong>? Perdera el acceso de inmediato y se cerraran todas sus sesiones. Puede reactivarlo después.</>}
          onConfirm={() => cambiar.mutate(desactivando)} onCancel={() => setDesactivando(null)} />
      )}
    </>
  );
}
