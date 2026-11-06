import type { ButtonHTMLAttributes } from 'react';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'md' | 'sm';
  block?: boolean;
  loading?: boolean;
}

export function Button({ variant = 'primary', size = 'md', block, loading, disabled, children, className = '', type = 'button', ...rest }: Props) {
  const cls = `btn btn-${variant}${size === 'sm' ? ' btn-sm' : ''}${block ? ' btn-block' : ''} ${className}`.trim();
  return (
    <button {...rest} type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined}>
      {loading && <span className="spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}
