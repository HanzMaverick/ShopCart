import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError } from '../../api/http';
import { homeFor, useAuth } from '../../auth/AuthContext';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/fields';
import { Alert, Card } from '../../components/ui/feedback';
import { applyServerErrors, errorMessage } from '../../lib/errors';
import { loginSchema, registerSchema, type LoginForm, type RegisterForm } from '../../lib/schemas';

/** Solo rutas internas: evita redirecciones abiertas (?next=https://sitio-malicioso). */
const safeNext = (next: string | null): string | null => (next && next.startsWith('/') && !next.startsWith('//') ? next : null);

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });
  const next = safeNext(sp.get('next'));

  if (user) return <Navigate to={next ?? homeFor(user.rol)} replace />;

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    try {
      const u = await login(v.correo, v.contrasena);
      navigate(next ?? homeFor(u.rol), { replace: true });
    } catch (e) {
      setFormError(e instanceof ApiError && e.code === 'INVALID_CREDENTIALS' ? 'Correo o contrasena incorrectos.' : errorMessage(e));
    }
  });

  return (
    <div style={{ maxWidth: 420, margin: '2rem auto' }}>
      <Card>
        <h1>Iniciar sesion</h1>
        <form className="stack" onSubmit={onSubmit} noValidate>
          {formError && <Alert tone="error">{formError}</Alert>}
          <TextField label="Correo" type="email" autoComplete="email" error={errors.correo?.message} {...register('correo')} />
          <TextField label="Contrasena" type="password" autoComplete="current-password" error={errors.contrasena?.message} {...register('contrasena')} />
          <Button type="submit" loading={isSubmitting} block>Ingresar</Button>
          <p className="muted small">¿No tiene cuenta? <Link to={`/registro${sp.get('next') ? `?next=${encodeURIComponent(sp.get('next')!)}` : ''}`}>Crear cuenta</Link></p>
        </form>
      </Card>
    </div>
  );
}

export function RegisterPage() {
  const { user, register: registrar } = useAuth();
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) });
  const next = safeNext(sp.get('next'));

  if (user) return <Navigate to={next ?? homeFor(user.rol)} replace />;

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    try {
      await registrar({ nombre: v.nombre, correo: v.correo, contrasena: v.contrasena });
      navigate(next ?? '/', { replace: true });
    } catch (e) {
      if (!applyServerErrors(e, setError, ['nombre', 'correo', 'contrasena'])) setFormError(errorMessage(e));
    }
  });

  return (
    <div style={{ maxWidth: 460, margin: '2rem auto' }}>
      <Card>
        <h1>Crear cuenta</h1>
        <form className="stack" onSubmit={onSubmit} noValidate>
          {formError && <Alert tone="error">{formError}</Alert>}
          <TextField label="Nombre completo" autoComplete="name" error={errors.nombre?.message} {...register('nombre')} />
          <TextField label="Correo" type="email" autoComplete="email" error={errors.correo?.message} {...register('correo')} />
          <TextField label="Contrasena" type="password" autoComplete="new-password" hint="Minimo 8 caracteres, con letras y numeros." error={errors.contrasena?.message} {...register('contrasena')} />
          <TextField label="Confirmar contrasena" type="password" autoComplete="new-password" error={errors.confirmar?.message} {...register('confirmar')} />
          <Button type="submit" loading={isSubmitting} block>Crear cuenta</Button>
          <p className="muted small">¿Ya tiene cuenta? <Link to="/login">Iniciar sesion</Link></p>
        </form>
      </Card>
    </div>
  );
}
