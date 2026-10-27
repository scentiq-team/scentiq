/** A named check that /readyz runs (the frontend build, the database). */
export interface ReadinessCheck {
  name: string;
  check: () => boolean | Promise<boolean>;
}
