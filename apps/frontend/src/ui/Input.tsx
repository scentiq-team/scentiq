import { type ComponentPropsWithRef, useId } from 'react';
import { cx } from '@/utils/cx';

export interface InputProps extends Omit<ComponentPropsWithRef<'input'>, 'id'> {
  /** Always visible: placeholders are not labels. */
  label: string;
  hint?: string;
  /** When present the field is marked invalid and the message is tied to the input. */
  error?: string | undefined;
  id?: string;
}

export function Input({ label, hint, error, id, className, ...rest }: InputProps) {
  const generated = useId();
  const inputId = id ?? generated;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={cx(
          'min-h-11 w-full rounded-control border bg-surface px-3 text-base text-ink',
          'placeholder:text-muted transition-colors duration-(--duration-fast)',
          error ? 'border-danger' : 'border-control hover:border-muted',
          className,
        )}
        {...rest}
      />
      {hint ? (
        <p id={hintId} className="m-0 text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="m-0 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
