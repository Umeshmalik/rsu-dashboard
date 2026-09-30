import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import { grantSchema, settingsSchema } from "~/lib/schemas";
import { defaultSettings, type Grant, type Settings } from "~/lib/types";
import { z } from "zod";

const fileSchema = z.object({
  grants: z.array(grantSchema),
  settings: settingsSchema.partial().optional(),
  meta: z
    .object({
      lastImport: z
        .object({
          at: z.number(),
          file: z.string(),
        })
        .nullable()
        .optional(),
    })
    .optional(),
});

function dataDir(): string {
  return process.env.RSU_DATA_DIR ?? path.join(process.cwd(), "data");
}

export interface ClaimedLedger {
  grants: Grant[];
  settings: Settings;
  lastImport: { at: number; file: string } | null;
}

/** Read a ledger left on disk by an older version. Returns null when there is nothing to move. */
export async function claimLedger(): Promise<ClaimedLedger | null> {
  try {
    const raw: unknown = JSON.parse(
      await fs.readFile(path.join(dataDir(), "db.json"), "utf8"),
    );
    const parsed = fileSchema.safeParse(raw);
    if (!parsed.success) return null;
    return {
      grants: parsed.data.grants,
      settings: { ...defaultSettings(), ...parsed.data.settings },
      lastImport: parsed.data.meta?.lastImport ?? null,
    };
  } catch {
    return null;
  }
}

export async function discardLedger(): Promise<void> {
  await fs.rm(dataDir(), { recursive: true, force: true });
}
