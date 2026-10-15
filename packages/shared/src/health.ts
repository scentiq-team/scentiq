import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  version: z.string(),
  time: z.string(),
  /** Only present outside production. */
  env: z.string().optional(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
