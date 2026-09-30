import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { grantSchema, settingsSchema } from "~/lib/schemas";
import { headerSummary, parseFile } from "~/server/parse";
import {
  applyImport,
  ensureLoaded,
  publicState,
  refreshQuote,
  replaceState,
} from "~/server/store";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

const MAX_IMPORT_BYTES = 25 * 1024 * 1024;

export const rsuRouter = createTRPCRouter({
  state: publicProcedure.query(async () => {
    await ensureLoaded();
    return publicState();
  }),

  save: publicProcedure
    .input(z.object({ grants: z.array(grantSchema), settings: settingsSchema }))
    .mutation(async ({ input }) => {
      await replaceState(input.grants, input.settings);
      return { ok: true as const };
    }),

  importFile: publicProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        dataBase64: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      await ensureLoaded();
      const file = input.name;
      const buf = Buffer.from(input.dataBase64, "base64");
      if (buf.length > MAX_IMPORT_BYTES) {
        throw new TRPCError({
          code: "PAYLOAD_TOO_LARGE",
          message: "File is larger than 25MB.",
        });
      }
      try {
        const parsed = parseFile(buf);
        if (parsed.length === 0) {
          throw new TRPCError({
            code: "UNPROCESSABLE_CONTENT",
            message:
              "No RSU grants found in that file. Use Holdings → download → Download expanded in E*TRADE.",
            cause: { headers: headerSummary(buf) },
          });
        }
        return await applyImport(parsed, file, "upload");
      } catch (e) {
        if (e instanceof TRPCError) throw e;
        const message = e instanceof Error ? e.message : "unknown error";
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Couldn't read ${file}: ${message}`,
        });
      }
    }),

  quote: publicProcedure
    .input(z.object({ force: z.boolean().default(false) }))
    .mutation(async ({ input }) => {
      try {
        return await refreshQuote(input.force);
      } catch (e) {
        if (e instanceof TRPCError) throw e;
        const message = e instanceof Error ? e.message : "Quote failed";
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
      }
    }),
});
