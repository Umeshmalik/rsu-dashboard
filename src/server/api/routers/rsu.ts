import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { claimLedger, discardLedger } from "~/server/claim";
import { marketQuote } from "~/server/market";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

const symbolSchema = z
  .string()
  .trim()
  .min(1)
  .max(12)
  .regex(/^[A-Za-z][A-Za-z0-9.-]*$/);

export const rsuRouter = createTRPCRouter({
  quote: publicProcedure
    .input(z.object({ symbol: symbolSchema, fresh: z.boolean().default(false) }))
    .mutation(async ({ input }) => {
      try {
        return await marketQuote(input.symbol, input.fresh);
      } catch (e) {
        if (e instanceof TRPCError) throw e;
        const message = e instanceof Error ? e.message : "Quote failed";
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
      }
    }),

  claim: publicProcedure.query(() => claimLedger()),

  discard: publicProcedure.mutation(async () => {
    await discardLedger();
    return { ok: true as const };
  }),
});
