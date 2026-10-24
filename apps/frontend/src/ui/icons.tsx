// Small decorative icons. All are aria-hidden: the control or text next to them carries the name.
import type { ComponentPropsWithoutRef } from 'react';

function Icon(props: ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    />
  );
}

export function MenuIcon(props: ComponentPropsWithoutRef<'svg'>) {
  return (
    <Icon {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Icon>
  );
}

export function CloseIcon(props: ComponentPropsWithoutRef<'svg'>) {
  return (
    <Icon {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Icon>
  );
}

/** A perfume bottle outline, used on empty states. */
export function BottleIcon(props: ComponentPropsWithoutRef<'svg'>) {
  return (
    <Icon {...props}>
      <path d="M9 3h6v3H9zM10 6v2.2C7.6 9.3 6 11.6 6 14.5V19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-4.5c0-2.9-1.6-5.2-4-6.3V6" />
    </Icon>
  );
}
