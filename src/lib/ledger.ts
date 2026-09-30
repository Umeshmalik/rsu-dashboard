import { grantSchema, settingsSchema } from "~/lib/schemas";
import { defaultSettings, type Grant, type Settings } from "~/lib/types";
import { z } from "zod";

export const LEDGER_KEY = "rsu-ledger-v1";

const storedSchema = z.object({
  grants: z.array(grantSchema),
  settings: settingsSchema,
  lastImport: z.object({ at: z.number(), file: z.string() }).nullable(),
});

export interface Ledger {
  grants: Grant[];
  settings: Settings;
  lastImport: { at: number; file: string } | null;
}

export function emptyLedger(): Ledger {
  return { grants: [], settings: defaultSettings(), lastImport: null };
}

export function loadLedger(): Ledger {
  if (typeof window === "undefined") return emptyLedger();
  try {
    const raw = localStorage.getItem(LEDGER_KEY);
    if (!raw) return emptyLedger();
    const parsed = storedSchema.safeParse(JSON.parse(raw) as unknown);
    return parsed.success ? parsed.data : emptyLedger();
  } catch {
    return emptyLedger();
  }
}

export function saveLedger(ledger: Ledger): void {
  try {
    localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger));
  } catch {
    /* private mode or a full disk */
  }
}
