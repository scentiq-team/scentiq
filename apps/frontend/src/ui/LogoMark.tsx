import { cx } from '@/utils/cx';
import { MARK_IQ_PATH, MARK_S_PATH } from './logoPaths';

function Shapes() {
  return (
    <>
      <rect
        x="8"
        y="8"
        width="496"
        height="496"
        rx="108"
        strokeWidth="10"
        className="fill-bg stroke-accent"
      />
      <path d={MARK_S_PATH} className="fill-accent" />
      <path d={MARK_IQ_PATH} className="fill-signal" />
    </>
  );
}

/**
 * The brand mark: a gold "S" with a small "IQ" in the quiet signal colour, drawn from the
 * Cormorant Garamond outlines (see design/brand). Colours come from theme classes, not inline
 * styles, so the strict CSP stays intact. Without a `title` it is decorative and hidden from
 * assistive technology; give it a `title` when it stands alone.
 */
export function LogoMark({ title, className }: { title?: string; className?: string }) {
  const classes = cx('size-10 shrink-0', className);
  if (title) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" className={classes}>
        <title>{title}</title>
        <Shapes />
      </svg>
    );
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      aria-hidden="true"
      focusable="false"
      className={classes}
    >
      <Shapes />
    </svg>
  );
}
