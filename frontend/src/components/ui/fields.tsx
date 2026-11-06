import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

interface FieldShellProps { id: string; label: string; error?: string | undefined; hint?: string | undefined; children: ReactNode }

function FieldShell({ id, label, error, hint, children }: FieldShellProps) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && !error && <span className="field-hint" id={`${id}-hint`}>{hint}</span>}
      {error && <span className="field-error" id={`${id}-err`} role="alert">{error}</span>}
    </div>
  );
}

const describedBy = (id: string, error?: string, hint?: string) => (error ? `${id}-err` : hint ? `${id}-hint` : undefined);

interface CommonProps { label: string; error?: string | undefined; hint?: string | undefined }

export const TextField = forwardRef<HTMLInputElement, CommonProps & InputHTMLAttributes<HTMLInputElement>>(
  function TextField({ label, error, hint, className = '', ...rest }, ref) {
    const id = useId();
    return (
      <FieldShell id={id} label={label} error={error} hint={hint}>
        <input {...rest} ref={ref} id={id} className={`input ${className}`.trim()} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, error, hint)} />
      </FieldShell>
    );
  });

export const SelectField = forwardRef<HTMLSelectElement, CommonProps & SelectHTMLAttributes<HTMLSelectElement>>(
  function SelectField({ label, error, hint, children, ...rest }, ref) {
    const id = useId();
    return (
      <FieldShell id={id} label={label} error={error} hint={hint}>
        <select {...rest} ref={ref} id={id} className="select" aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, error, hint)}>{children}</select>
      </FieldShell>
    );
  });

export const TextareaField = forwardRef<HTMLTextAreaElement, CommonProps & TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function TextareaField({ label, error, hint, ...rest }, ref) {
    const id = useId();
    return (
      <FieldShell id={id} label={label} error={error} hint={hint}>
        <textarea {...rest} ref={ref} id={id} className="textarea" rows={3} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, error, hint)} />
      </FieldShell>
    );
  });

export function Checkbox({ label, ...rest }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return <label className="check"><input {...rest} type="checkbox" /> {label}</label>;
}
