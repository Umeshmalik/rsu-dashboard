import "server-only";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
  Accept: "application/json,text/plain,*/*",
};

interface Tick {
  price: number;
  time: number;
  src: string;
}

function money(raw: unknown): number | null {
  const n = Number.parseFloat(String(raw ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function stamp(raw: unknown): number {
  const cleaned = String(raw ?? "").replace(/\s+(ET|EDT|EST|UTC|GMT)$/i, "");
  const time = Date.parse(cleaned);
  return Number.isFinite(time) ? time : Date.now();
}

async function yahoo(sym: string): Promise<Tick | null> {
  for (const host of ["query1", "query2"]) {
    try {
      const r = await fetch(
        `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5d`,
        { headers: HEADERS, signal: AbortSignal.timeout(8000) },
      );
      if (!r.ok) continue;
      const j = (await r.json()) as {
        chart?: {
          result?: {
            meta?: { regularMarketPrice?: number; regularMarketTime?: number };
          }[];
        };
      };
      const m = j.chart?.result?.[0]?.meta;
      const price = money(m?.regularMarketPrice);
      if (price != null) {
        return {
          price,
          time: (m?.regularMarketTime ?? Date.now() / 1000) * 1000,
          src: "Yahoo Finance",
        };
      }
    } catch {
      /* try the next host */
    }
  }
  return null;
}

async function nasdaq(sym: string): Promise<Tick | null> {
  if (!/^[A-Za-z][A-Za-z0-9.-]{0,9}$/.test(sym)) return null;
  try {
    const r = await fetch(
      `https://api.nasdaq.com/api/quote/${encodeURIComponent(sym)}/info?assetclass=stocks`,
      {
        headers: { ...HEADERS, Origin: "https://www.nasdaq.com" },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!r.ok) return null;
    const j = (await r.json()) as {
      data?: { primaryData?: { lastSalePrice?: string; lastTradeTimestamp?: string } };
    };
    const primary = j.data?.primaryData;
    const price = money(primary?.lastSalePrice);
    if (price == null) return null;
    return { price, time: stamp(primary?.lastTradeTimestamp), src: "Nasdaq" };
  } catch {
    return null;
  }
}

async function cnbc(sym: string): Promise<Tick | null> {
  const ticker = sym.replace(/\.us$/i, "");
  if (!/^[A-Za-z][A-Za-z0-9.-]{0,9}$/.test(ticker)) return null;
  try {
    const r = await fetch(
      `https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=${encodeURIComponent(ticker)}&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json&events=1`,
      { headers: HEADERS, signal: AbortSignal.timeout(8000) },
    );
    if (!r.ok) return null;
    const j = (await r.json()) as {
      FormattedQuoteResult?: {
        FormattedQuote?: { last?: string; last_time?: string }[];
      };
    };
    const row = j.FormattedQuoteResult?.FormattedQuote?.[0];
    const price = money(row?.last);
    if (price == null) return null;
    return { price, time: stamp(row?.last_time), src: "CNBC" };
  } catch {
    return null;
  }
}

async function cnbcSpot(): Promise<Tick | null> {
  try {
    const r = await fetch(
      "https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=INR%3D&requestMethod=itv&noform=1&partnerId=2&output=json",
      { headers: HEADERS, signal: AbortSignal.timeout(8000) },
    );
    if (!r.ok) return null;
    const j = (await r.json()) as {
      FormattedQuoteResult?: {
        FormattedQuote?: { last?: string; last_time?: string; name?: string }[];
      };
    };
    const row = j.FormattedQuoteResult?.FormattedQuote?.[0];
    const price = money(row?.last);
    if (price == null || !/rupee/i.test(row?.name ?? "")) return null;
    return { price, time: stamp(row?.last_time), src: "CNBC spot" };
  } catch {
    return null;
  }
}

async function frankfurter(): Promise<Tick | null> {
  try {
    const r = await fetch("https://api.frankfurter.app/latest?from=USD&to=INR", {
      headers: HEADERS,
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { date?: string; rates?: { INR?: number } };
    const price = money(j.rates?.INR);
    if (price == null) return null;
    return { price, time: stamp(j.date), src: "Frankfurter" };
  } catch {
    return null;
  }
}

async function stooq(sym: string): Promise<Tick | null> {
  try {
    const r = await fetch(
      `https://stooq.com/q/l/?s=${encodeURIComponent(sym)}&f=sd2t2c&h&e=csv`,
      { headers: HEADERS, signal: AbortSignal.timeout(8000) },
    );
    const lines = (await r.text()).trim().split(/\r?\n/);
    const line = lines[1];
    if (!line || line.includes("<")) return null;
    const parts = line.split(",");
    const d = parts[1];
    const tm = parts[2];
    const price = money(parts[3]);
    if (price == null) return null;
    const time = d && tm ? Date.parse(`${d}T${tm}Z`) : Number.NaN;
    return { price, time: Number.isFinite(time) ? time : Date.now(), src: "Stooq" };
  } catch {
    return null;
  }
}

async function stockPrice(symbol: string): Promise<Tick | null> {
  return (
    (await yahoo(symbol)) ??
    (await nasdaq(symbol)) ??
    (await cnbc(symbol)) ??
    (await stooq(`${symbol.toLowerCase()}.us`))
  );
}

async function fxRate(): Promise<Tick | null> {
  // E*TRADE values dollars at the live USD/INR spot, not the previous ECB fix.
  return (
    (await yahoo("USDINR=X")) ??
    (await cnbcSpot()) ??
    (await frankfurter()) ??
    (await stooq("usdinr"))
  );
}

export async function getQuote(symbol: string): Promise<{
  price: number;
  usdinr: number;
  asOf: string;
}> {
  const [p, f] = await Promise.all([stockPrice(symbol), fxRate()]);
  if (!p) throw new Error(`Couldn't get a price for ${symbol}`);
  if (!f) throw new Error("Couldn't get the USD/INR rate");
  const when = new Date(p.time).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const fxNote = f.src === p.src ? "" : `; USD/INR ${f.src}`;
  return {
    price: +p.price.toFixed(4),
    usdinr: +f.price.toFixed(4),
    asOf: `${p.src}, ${symbol} last trade ${when}${fxNote}`,
  };
}
