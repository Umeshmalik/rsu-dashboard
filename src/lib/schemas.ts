import { z } from "zod";

import type { Grant, Settings, Vest } from "~/lib/types";

export const vestSchema = z.object({
  date: z.string(),
  qty: z.number(),
  withheld: z.number().nullable(),
  src: z.enum(["import", "allocated", "manual", "edited"]),
  fmv: z.number().nullable().optional(),
}) satisfies z.ZodType<Vest>;

export const grantSchema = z.object({
  id: z.string(),
  grantNumber: z.string(),
  grantDate: z.string(),
  symbol: z.string(),
  granted: z.number(),
  withheldTotal: z.number(),
  vests: z.array(vestSchema),
}) satisfies z.ZodType<Grant>;

export const settingsSchema = z.object({
  symbol: z.string().min(1),
  price: z.number().nullable(),
  usdinr: z.number().nullable(),
  asOf: z.string().nullable(),
  fetchedAt: z.number().nullable(),
  manualPrice: z.boolean(),
  taxRate: z.number(),
  useHistRate: z.boolean(),
}) satisfies z.ZodType<Settings>;
