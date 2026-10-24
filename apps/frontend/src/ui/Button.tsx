import type { ComponentPropsWithRef } from 'react';
import { Link, type LinkProps } from 'react-router';
import { cx } from '@/utils/cx';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'md' | 'lg';

const BASE =
  'inline-flex select-none items-center justify-center gap-2 rounded-control font-medium ' +
  'no-underline transition-[background-color,filter,color] duration-(--duration-fast) ease-(--ease-out) ' +
  'disabled:pointer-events-none disabled:opacity-50';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent hover:brightness-110 active:brightness-95',
  secondary: 'border border-control text-ink hover:bg-surface-2 active:bg-surface',
  ghost: 'text-ink hover:bg-surface-2 active:bg-surface',
};

// 44px is the minimum comfortable touch target (WCAG 2.5.8 asks for 24px; we aim higher).
const SIZES: Record<ButtonSize, string> = {
  md: 'min-h-11 px-4 text-sm',
  lg: 'min-h-12 px-6 text-base',
};

export function buttonClasses(options: {
  variant?: ButtonVariant | undefined;
  size?: ButtonSize | undefined;
  className?: string | undefined;
}): string {
  const { variant = 'primary', size = 'md', className } = options;
  return cx(BASE, VARIANTS[variant], SIZES[size], className);
}

export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Disables the button and tells assistive technology it is busy. */
  loading?: boolean;
}

export function Button({
  variant,
  size,
  loading = false,
  disabled,
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, className })}
      {...rest}
    />
  );
}

export interface ButtonLinkProps extends LinkProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/** A router link that looks like a button (navigation, not an action). */
export function ButtonLink({ variant, size, className, ...rest }: ButtonLinkProps) {
  return <Link className={buttonClasses({ variant, size, className })} {...rest} />;
}
