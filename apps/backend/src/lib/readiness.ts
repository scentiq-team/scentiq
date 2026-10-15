/** A named check that /readyz runs. Later phases register the database here. */
export interface ReadinessCheck {
  name: string;
  check: () => boolean | Promise<boolean>;
}
