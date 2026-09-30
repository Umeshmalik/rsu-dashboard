import "server-only";

import { getQuote } from "~/server/quote";

const QUOTE_CACHE_MS = 10 * 60 * 1000;

export interface MarketQuote {
  price: number;
  usdinr: number;
  asOf: string;
  fetchedAt: number;
}

const cache = new Map<string, { at: number; value: MarketQuote }>();

export function resetQuoteCache(): void {
  cache.clear();
}

export async function marketQuote(symbol: string, fresh: boolean): Promise<MarketQuote> {
  const key = symbol.toUpperCase();
  const hit = cache.get(key);
  if (!fresh && hit && Date.now() - hit.at < QUOTE_CACHE_MS) return hit.value;
  const quote = await getQuote(key);
  const value = { ...quote, fetchedAt: Date.now() };
  cache.set(key, { at: Date.now(), value });
  return value;
}
