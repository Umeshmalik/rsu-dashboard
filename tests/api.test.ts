import { TRPCClientError, createTRPCClient, httpBatchStreamLink } from "@trpc/client";
import { NextRequest } from "next/server";
import SuperJSON from "superjson";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

import { mergeGrants } from "~/lib/rsu";
import { GET as trpcGet, POST as trpcPost } from "~/app/api/trpc/[trpc]/route";
import type { AppRouter } from "~/server/api/root";
import { headerSummary, parseFile } from "~/server/parse";
import { resetQuoteCache } from "~/server/market";

function workbook(rows: Record<string, unknown>[], sheet = "Holdings"): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), sheet);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

function client() {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchStreamLink({
        transformer: SuperJSON,
        url: "http://127.0.0.1/api/trpc",
        fetch: async (input, init) => {
          const method = (init?.method ?? "GET").toUpperCase();
          const req = new NextRequest(new Request(input, init as RequestInit));
          return method === "GET" ? trpcGet(req) : trpcPost(req);
        },
      }),
    ],
  });
}

function yahoo(price: number) {
  return new Response(
    JSON.stringify({
      chart: {
        result: [
          {
            meta: {
              regularMarketPrice: price,
              regularMarketTime: 1_700_000_000,
            },
          },
        ],
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

beforeEach(() => {
  resetQuoteCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetQuoteCache();
});

describe("workbook import", () => {
  const rows = [
    {
      "Record Type": "Grant",
      "Grant Number": "G-100",
      "Grant Date": "08/15/2024",
      Symbol: "MSFT",
      "Granted Qty": 30,
      "Withheld Qty": 9,
    },
    {
      "Record Type": "Vest",
      "Grant Number": "G-100",
      "Vest Date": "11/15/2024",
      "Vested Qty": 10,
    },
    {
      "Record Type": "Vest",
      "Grant Number": "G-100",
      "Vest Date": "11/15/2025",
      "Vested Qty": 20,
    },
    {
      "Record Type": "Vest",
      "Grant Number": "G-100",
      "Vest Date": "11/15/2099",
      "Vested Qty": 10,
    },
  ];

  it("reads an E*TRADE workbook and keeps hand-edited tax shares", () => {
    const buf = workbook(rows);
    const parsed = parseFile(buf);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.vests).toHaveLength(3);
    expect(parsed[0]?.symbol).toBe("MSFT");
    expect(parsed[0]?.granted).toBe(30);
    const past = parsed[0]?.vests.filter((v) => v.date < "2026-01-01") ?? [];
    expect(past.reduce((sum, v) => sum + (v.withheld ?? 0), 0)).toBe(9);
    expect(past.every((v) => v.src === "allocated")).toBe(true);

    const grant = parsed[0];
    if (!grant) return;
    const edited = grant.vests.map((v) =>
      v.date === "2024-11-15" ? { ...v, withheld: 4, src: "edited" as const } : v,
    );
    const again = mergeGrants([{ ...grant, vests: edited }], parseFile(buf));
    expect(again[0]?.vests[0]).toMatchObject({
      date: "2024-11-15",
      withheld: 4,
      src: "edited",
    });
  });

  it("reports the columns when a workbook has no grants", () => {
    const buf = workbook([{ Note: "hello" }]);
    expect(parseFile(buf)).toEqual([]);
    expect(headerSummary(buf)[0]?.headers).toContain("Note");
  });

  it("finds no grants in a file that is not a spreadsheet", () => {
    expect(parseFile(Buffer.from("not a spreadsheet"))).toEqual([]);
  });

  it("rejects a workbook the parser cannot read", () => {
    expect(() => parseFile(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]))).toThrow();
  });

  it("skips ESPP sheets and spreads withheld shares", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet([{ "Record Type": "Grant", "Grant Number": "ESPP-1" }]),
      "ESPP",
    );
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Holdings");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const grants = parseFile(buf);
    expect(grants.map((g) => g.id)).toEqual(["G-100"]);
  });

  it("uses shares traded for taxes and ignores sellable-lot withheld counts", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet([
        {
          "Record Type": "Grant",
          "Grant Number": "G-200",
          "Vest Date": "11/15/2024",
          "Sellable Qty.": 8,
          "Shares Withheld ": 1,
          "Purchased Qty.": 8,
        },
      ]),
      "Sellable",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet([
        {
          "Record Type": "Grant",
          "Grant Number": "G-200",
          "Grant Date": "08/15/2024",
          Symbol: "EXPE",
          "Granted Qty.": 10,
          "Withheld Qty.": "",
        },
        {
          "Record Type": "Vest Schedule",
          "Grant Number": "G-200",
          "Vest Date": "11/15/2024",
          "Vested Qty.": 4,
          "Granted Qty._1": 4,
          "Shares Traded for taxes": 2,
          "Withheld Qty.": 0,
          "Market Value at Release": 100,
        },
        {
          "Record Type": "Vest Schedule",
          "Grant Number": "G-200",
          "Vest Date": "11/15/2099",
          "Vested Qty.": 0,
          "Unvested Qty._1": 6,
          "Granted Qty._1": 6,
          "Shares Traded for taxes": 0,
        },
      ]),
      "Unvested",
    );
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const grants = parseFile(buf);
    expect(grants).toHaveLength(1);
    expect(grants[0]?.granted).toBe(10);
    expect(grants[0]?.vests).toHaveLength(2);
    expect(grants[0]?.vests[0]).toMatchObject({
      date: "2024-11-15",
      qty: 4,
      withheld: 2,
      fmv: 100,
      src: "import",
    });
    expect(grants[0]?.vests[1]).toMatchObject({
      date: "2099-11-15",
      qty: 6,
      withheld: null,
    });
  });
});

describe("rsu.quote", () => {
  it("reads Yahoo and then serves the cached price", async () => {
    const api = client();
    const calls = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("USDINR")) return yahoo(83.25);
      if (url.includes("finance.yahoo.com")) return yahoo(180.5);
      return new Response("missing", { status: 404 });
    });
    vi.stubGlobal("fetch", calls);

    const first = await api.rsu.quote.mutate({ symbol: "EXPE", fresh: true });
    expect(first.price).toBe(180.5);
    expect(first.usdinr).toBe(83.25);
    expect(first.asOf).toContain("Yahoo Finance");
    const used = calls.mock.calls.length;

    const second = await api.rsu.quote.mutate({ symbol: "EXPE", fresh: false });
    expect(second.price).toBe(180.5);
    expect(calls.mock.calls.length).toBe(used);
  });

  it("uses Nasdaq and Frankfurter when Yahoo is rate limited", async () => {
    const api = client();
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("finance.yahoo.com")) {
        return new Response("Too Many Requests", { status: 429 });
      }
      if (url.includes("api.nasdaq.com/api/quote/EXPE")) {
        return Response.json({
          data: {
            primaryData: {
              lastSalePrice: "$266.495",
              lastTradeTimestamp: "Sep 30, 2026 8:07 AM ET",
            },
          },
        });
      }
      if (url.includes("frankfurter.app")) {
        return Response.json({
          date: "2026-09-29",
          rates: { INR: 95.98 },
        });
      }
      return new Response("missing", { status: 404 });
    });
    const quote = await api.rsu.quote.mutate({ symbol: "EXPE", fresh: true });
    expect(quote.price).toBe(266.495);
    expect(quote.usdinr).toBe(95.98);
    expect(quote.asOf).toContain("Nasdaq");
    expect(quote.asOf).toContain("Frankfurter");
  });

  it("uses the CNBC dollar-rupee spot when Yahoo is rate limited", async () => {
    const api = client();
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("finance.yahoo.com")) {
        return new Response("Too Many Requests", { status: 429 });
      }
      if (url.includes("symbols=INR%3D") || url.includes("symbols=INR=")) {
        return Response.json({
          FormattedQuoteResult: {
            FormattedQuote: [
              {
                last: "95.83",
                last_time: "2026-09-30T06:01:00.000-0400",
                name: "US Dollar/Indian Rupee FX Spot Rate",
              },
            ],
          },
        });
      }
      if (url.includes("api.nasdaq.com/api/quote/EXPE")) {
        return Response.json({
          data: {
            primaryData: {
              lastSalePrice: "$266.33",
              lastTradeTimestamp: "Sep 30, 2026 8:51 AM ET",
            },
          },
        });
      }
      if (url.includes("frankfurter.app")) {
        return Response.json({ date: "2026-09-29", rates: { INR: 95.98 } });
      }
      return new Response("missing", { status: 404 });
    });
    const quote = await api.rsu.quote.mutate({ symbol: "EXPE", fresh: true });
    expect(quote.price).toBe(266.33);
    expect(quote.usdinr).toBe(95.83);
    expect(quote.asOf).toContain("CNBC spot");
  });

  it("falls back to Stooq when Yahoo fails", async () => {
    const api = client();
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("finance.yahoo.com")) return new Response("no", { status: 500 });
      if (url.includes("stooq.com")) {
        const close = url.includes("usdinr") ? "83.5" : "150.25";
        const symbol = url.includes("usdinr") ? "USDINR" : "expe.us";
        return new Response(
          `Symbol,Date,Time,Close\n${symbol},2026-09-30,12:00:00,${close}\n`,
          { status: 200 },
        );
      }
      return new Response("missing", { status: 404 });
    });
    const quote = await api.rsu.quote.mutate({ symbol: "EXPE", fresh: true });
    expect(quote.price).toBe(150.25);
    expect(quote.usdinr).toBe(83.5);
    expect(quote.asOf).toContain("Stooq");
  });

  it("returns an error when both quote sources fail", async () => {
    const api = client();
    vi.stubGlobal("fetch", async () => new Response("no", { status: 503 }));
    await expect(api.rsu.quote.mutate({ symbol: "EXPE", fresh: true })).rejects.toMatchObject({
      message: "Couldn't get a price for EXPE",
      data: { code: "INTERNAL_SERVER_ERROR" },
    });
  });
});
