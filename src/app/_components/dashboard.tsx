"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { LEDGER_KEY, loadLedger, saveLedger } from "~/lib/ledger";
import { headerSummary, parseFile } from "~/server/parse";
import {
  compute,
  fmtDate,
  genSchedule,
  INR,
  mergeGrants,
  SAMPLE,
  toDate,
  today0,
  U,
  USD,
} from "~/lib/rsu";
import type { Grant, Settings } from "~/lib/types";
import { Walkthrough } from "~/app/_components/walkthrough";
import { api } from "~/trpc/react";

const C = {
  rule: "#D5DBD6",
  mute: "#5D6B74",
  got: "#2E6E57",
  tax: "#9C4A6B",
  pay: "#B86A1A",
  fGot: "#8DBFAC",
  fTax: "#DDB0C2",
  fPay: "#E4C48A",
};

type Tab = "upcoming" | "past" | "fy" | "grants";
type Unit = "units" | "usd" | "inr";
type Status = { text: string; detail?: string | null };

const focus =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";
const btn = `rounded-md border border-ink bg-ink px-3.5 py-2 text-sm font-semibold text-white disabled:cursor-default disabled:opacity-50 ${focus}`;
const btnGhost = `rounded-md border border-rule bg-transparent px-3.5 py-2 text-sm font-semibold text-ink disabled:cursor-default disabled:opacity-50 ${focus}`;
const btnSmall = "px-2.5 py-1";

function ColorKey() {
  const items = [
    ["Tax", C.tax],
    ["Salary", C.pay],
    ["In your account", C.got],
    ["Still to receive", C.fGot],
    ["Future salary", C.fPay],
    ["Future tax", C.fTax],
  ] as const;
  return (
    <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-[13px] text-mute">
      {items.map(([label, color]) => (
        <li key={label} className="flex items-center gap-1.5">
          <span
            className="inline-block size-2.5 rounded-sm"
            style={{ background: color }}
          />
          {label}
        </li>
      ))}
    </ul>
  );
}

function SummaryRow({
  label,
  value,
  detail,
  indent = false,
}: {
  label: string;
  value: string;
  detail?: string;
  indent?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 border-b border-rule py-2.5 last:border-b-0 ${indent ? "pl-4" : ""}`}
    >
      <span className="text-mute">{label}</span>
      <span className="text-right">
        <span className="font-semibold text-ink">{value}</span>
        {detail ? (
          <span className="mt-0.5 block text-[13px] font-normal text-mute">
            {detail}
          </span>
        ) : null}
      </span>
    </div>
  );
}
const field = `rounded-md border border-rule bg-white px-2 py-1.5 text-sm text-ink ${focus}`;

function ago(ms: number | null, now: number | null): string {
  if (!ms) return "never";
  if (now == null) return fmtDate(new Date(ms));
  const m = Math.round((now - ms) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return fmtDate(new Date(ms));
}

export function Dashboard() {
  const stored = loadLedger();
  const [grants, setGrants] = useState<Grant[]>(stored.grants);
  const [settings, setSettings] = useState<Settings | null>(stored.settings);
  const [lastImport, setLastImport] = useState(stored.lastImport);
  const [loaded, setLoaded] = useState(true);
  const [online, setOnline] = useState(true);
  const [status, setStatus] = useState<Status | null>(null);
  const [tab, setTab] = useState<Tab>("upcoming");
  const [unit, setUnit] = useState<Unit>("units");
  const [now, setNow] = useState<number | null>(null);
  const [chartReady, setChartReady] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement>>>({});
  const backupRef = useRef<HTMLInputElement>(null);
  const skipSave = useRef(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const grantsRef = useRef(grants);
  grantsRef.current = grants;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const [needsClaim] = useState(() => {
    try {
      return localStorage.getItem(LEDGER_KEY) == null;
    } catch {
      return false;
    }
  });
  const claim = api.rsu.claim.useQuery(undefined, {
    enabled: needsClaim,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const discard = api.rsu.discard.useMutation();
  const discardRef = useRef(discard.mutate);
  discardRef.current = discard.mutate;
  const claimed = useRef(false);
  const quote = api.rsu.quote.useMutation({
    onSuccess: (s) => {
      setOnline(true);
      setSettings((cur) =>
        cur
          ? {
              ...cur,
              price: s.price,
              usdinr: s.usdinr,
              asOf: s.asOf,
              fetchedAt: s.fetchedAt,
              manualPrice: false,
            }
          : cur,
      );
    },
    onError: (e) => {
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      setOnline(!offline);
      setStatus({
        text: offline
          ? "You're offline. The last price and USD/INR stay in use."
          : `${e.message}. Enter the price under Assumptions, or try again.`,
      });
    },
  });
  const quoteRef = useRef(quote.mutate);
  quoteRef.current = quote.mutate;

  const pullQuote = useCallback((fresh: boolean) => {
    const current = settingsRef.current;
    if (!current || grantsRef.current.length === 0) return;
    if (!fresh && current.manualPrice) return;
    if (
      !fresh &&
      current.price &&
      current.fetchedAt &&
      Date.now() - current.fetchedAt < 10 * 60 * 1000
    ) {
      return;
    }
    if (!fresh && typeof navigator !== "undefined" && navigator.onLine === false) return;
    quoteRef.current({ symbol: current.symbol, fresh });
  }, []);

  useEffect(() => {
    if (!claim.data || claimed.current) return;
    claimed.current = true;
    const next = {
      grants: claim.data.grants,
      settings: claim.data.settings,
      lastImport: claim.data.lastImport,
    };
    saveLedger(next);
    skipSave.current = true;
    setGrants(next.grants);
    setSettings(next.settings);
    setLastImport(next.lastImport);
    discardRef.current();
  }, [claim.data]);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      pullQuote(false);
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    setOnline(navigator.onLine);
    const tick = () => setNow(Date.now());
    tick();
    setChartReady(true);
    const clock = setInterval(tick, 60_000);
    const prices = setInterval(() => pullQuote(false), 15 * 60 * 1000);
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js");
    }
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      clearInterval(clock);
      clearInterval(prices);
    };
  }, [pullQuote]);

  const closeGuide = useCallback(() => {
    try {
      localStorage.setItem("rsu-ledger-walkthrough", "1");
    } catch {
      /* private mode */
    }
    setGuideOpen(false);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      if (localStorage.getItem("rsu-ledger-walkthrough") !== "1")
        setGuideOpen(true);
    } catch {
      setGuideOpen(true);
    }
  }, [loaded]);

  useEffect(() => {
    if (!loaded || !settings) return;
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveLedger({ grants, settings, lastImport });
    }, 400);
  }, [grants, settings, lastImport, loaded]);

  useEffect(() => {
    pullQuote(false);
  }, [grants.length, pullQuote]);

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const data = await file.arrayBuffer();
      const parsed = parseFile(data);
      if (parsed.length === 0) {
        setStatus({
          text: "No RSU grants found in that file. Use Holdings → download → Download expanded in E*TRADE.",
          detail: JSON.stringify(headerSummary(data), null, 2),
        });
        return;
      }
      const sym = parsed.find((grant) => grant.symbol)?.symbol;
      setGrants((current) => mergeGrants(current, parsed));
      setSettings((current) =>
        current && sym && sym !== current.symbol
          ? { ...current, symbol: sym, fetchedAt: null }
          : current,
      );
      setLastImport({ at: Date.now(), file: file.name });
      setStatus({
        text: `Imported ${file.name}: ${parsed.length} grant${parsed.length === 1 ? "" : "s"}, ${parsed.reduce((sum, grant) => sum + grant.vests.length, 0)} vest dates.`,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Import failed";
      setStatus({ text: `Couldn't read ${file.name}: ${message}` });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const setWithheld = (grantId: string, idx: number, val: string) =>
    setGrants((gs) =>
      gs.map((g) =>
        g.id !== grantId
          ? g
          : {
              ...g,
              vests: g.vests.map((v, i) =>
                i !== idx
                  ? v
                  : {
                      ...v,
                      withheld:
                        val === "" ? null : Math.max(0, Number(val) || 0),
                      src: val === "" ? "manual" : "edited",
                    },
              ),
            },
      ),
    );

  const exportBackup = () => {
    const blob = new Blob([JSON.stringify({ grants, settings }, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `rsu-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };

  const importBackup = async (file: File) => {
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        !("grants" in parsed)
      ) {
        setStatus({ text: "That file isn't a backup from this dashboard." });
        return;
      }
      const body = parsed as { grants?: Grant[]; settings?: Partial<Settings> };
      setGrants(body.grants ?? []);
      setSettings((s) => (s ? { ...s, ...body.settings } : s));
      setStatus({ text: "Backup restored." });
    } catch {
      setStatus({ text: "That file isn't a backup from this dashboard." });
    }
  };

  const computed = useMemo(
    () => (settings ? compute(grants, settings) : null),
    [grants, settings],
  );

  const guide = (
    <Walkthrough
      open={guideOpen}
      onClose={closeGuide}
      onImport={() => fileRef.current?.click()}
    />
  );

  const upload = (label: string, ghost = false) => (
    <>
      <button
        type="button"
        className={ghost ? btnGhost : btn}
        onClick={() => fileRef.current?.click()}
      >
        {label}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        hidden
        onChange={(e) => void onImport(e.target.files?.[0])}
      />
    </>
  );

  const syncLine = (
    <div className="mb-6 text-[13px] text-mute">
      <span
        className={`mr-1.5 inline-block size-2 rounded-full align-[1px] ${online ? "bg-got" : "bg-rule"}`}
      />
      {online
        ? "Grants stay in this browser. Price and USD/INR update while you are online."
        : "You're offline. Grants in this browser still work. The last price and USD/INR stay in use."}{" "}
      {lastImport && (
        <>
          Last import {ago(lastImport.at, now)} from {lastImport.file}.
        </>
      )}
    </div>
  );

  const statusBox = status && (
    <div
      className="mb-4 rounded-md border border-rule border-l-4 border-l-gold bg-white px-3.5 py-2.5 text-sm"
      role="status"
    >
      {status.text}{" "}
      <button
        type="button"
        className={`${btnGhost} ${btnSmall}`}
        onClick={() => setStatus(null)}
      >
        Dismiss
      </button>
      {status.detail && (
        <pre className="mt-2 text-xs whitespace-pre-wrap text-mute">
          Columns found in your file (send these if the import looks wrong):
          {"\n"}
          {status.detail}
        </pre>
      )}
    </div>
  );

  if (!settings || !computed) {
    return (
      <main className="mx-auto max-w-270 px-5 pt-7 pb-16">
        <div className="rounded-md border border-rule border-l-4 border-l-gold bg-white px-3.5 py-2.5 text-sm">
          Can't reach the local server. Start it with{" "}
          <code className="rounded bg-[#eef1ee] px-1">pnpm dev</code>, then
          reload this page.
        </div>
      </main>
    );
  }

  const price = settings.price;
  const fx = settings.usdinr;
  const usd = (units: number) => (price ? units * price : null);
  const inr = (units: number) => (price && fx ? units * price * fx : null);
  const conv = (units: number) =>
    unit === "units"
      ? units
      : unit === "usd"
        ? (usd(units) ?? 0)
        : (inr(units) ?? 0);
  const fmtConv = (v: number): string => {
    switch (unit) {
      case "units":
        return U(v);
      case "usd":
        return USD(v);
      case "inr":
        return INR(v);
      default: {
        const exhaustive: never = unit;
        return exhaustive;
      }
    }
  };

  if (!grants.length) {
    return (
      <main className="mx-auto max-w-270 px-5 pt-7 pb-16">
        <div className="mb-2.5 text-lg font-extrabold tracking-tight">
          RSU ledger
        </div>
        {syncLine}
        {statusBox}
        <div className="max-w-170 rounded-[10px] border border-rule bg-card p-8">
          <h1 className="m-0 mb-2 text-3xl font-extrabold tracking-tight">
            Load your grants from E*TRADE
          </h1>
          <p className="m-0 leading-normal text-mute">
            The sheet is read in this browser and is not uploaded. The only
            request this site makes is the share price and the USD/INR rate.
          </p>
          <ol className="my-3 mb-5 list-decimal pl-5 leading-7">
            <li>Open Stock Plan → My Account → Holdings in E*TRADE.</li>
            <li>
              Click the download icon and choose <b>Download expanded</b>.
            </li>
            <li>Import the file here. It stays in this browser, including while you are offline.</li>
          </ol>
          <div className="flex flex-wrap items-center gap-2.5">
            {upload("Import from E*TRADE")}
            <button
              type="button"
              className={btnGhost}
              onClick={() => setGuideOpen(true)}
            >
              Show the steps
            </button>
            <button
              type="button"
              className={btnGhost}
              onClick={() => setGrants(structuredClone(SAMPLE))}
            >
              Try with sample data
            </button>
          </div>
        </div>
        <AddGrant symbol={settings.symbol} onAdd={(g) => setGrants([g])} />
        {guide}
      </main>
    );
  }

  const { T, rows, next, rate, taxRate, histRate, fy, quarters, scheduled } =
    computed;
  const inrOf = (dollars: number | null) =>
    dollars != null && fx ? dollars * fx : null;
  const pct = (units: number) => (scheduled ? (units / scheduled) * 100 : 0);
  const mismatch = grants.filter(
    (g) => Math.abs(g.granted - g.vests.reduce((a, v) => a + v.qty, 0)) > 0.5,
  );
  const tilde = (est: boolean) => (est ? "~" : "");
  const money = (dollars: number | null) =>
    `${USD(dollars)} · ${INR(inrOf(dollars))}`;

  const vestRows = rows
    .filter((r) => (tab === "past" ? r.past : !r.past))
    .sort((a, b) =>
      tab === "past"
        ? b.d.getTime() - a.d.getTime()
        : a.d.getTime() - b.d.getTime(),
    );

  return (
    <main className="mx-auto max-w-270 px-5 pt-7 pb-16">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="text-lg font-extrabold tracking-tight">RSU ledger</div>
        <div className="flex flex-wrap items-center gap-3 text-sm text-mute">
          <span
            className="inline-flex items-center gap-2 rounded-full border border-rule bg-card px-3 py-1"
            title={settings.asOf ?? "Live USD/INR spot, the rate E*TRADE uses"}
          >
            <span>
              {settings.symbol}{" "}
              <b className="font-semibold text-ink">
                {price ? `$${price.toFixed(2)}` : "—"}
              </b>
            </span>
            <span className="text-rule" aria-hidden>
              |
            </span>
            <span>
              USD/INR{" "}
              <b className="font-semibold text-ink">
                {fx ? fx.toFixed(2) : "—"}
              </b>
            </span>
            <span className="sr-only">
              {settings.asOf ?? "Live USD/INR spot, the rate E*TRADE uses"}
            </span>
          </span>
          <span>
            {settings.manualPrice
              ? "entered manually"
              : `updated ${ago(settings.fetchedAt, now)}`}
          </span>
          <button
            type="button"
            className={btnGhost}
            onClick={() => {
              if (settings) quote.mutate({ symbol: settings.symbol, fresh: true });
            }}
            disabled={quote.isPending}
          >
            {quote.isPending ? "Fetching…" : "Refresh price"}
          </button>
          <button
            type="button"
            className={btnGhost}
            onClick={() => setGuideOpen(true)}
          >
            Guide
          </button>
          {upload("Import file", true)}
        </div>
      </div>
      {syncLine}
      {statusBox}

      <section>
        <h1 className="m-0 text-[clamp(32px,4.4vw,44px)] leading-none font-extrabold tracking-tight">
          {U(T.pastNet)} shares in your account
        </h1>
        <p className="m-0 mt-2 text-[17px] text-mute">
          {U(T.futNet)} more on the way. {U(T.granted)} granted in total.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <section className="rounded-lg border border-rule bg-card px-5 py-4">
            <h2 className="m-0 text-sm font-semibold tracking-wide text-mute uppercase">
              Already vested
            </h2>
            <p className="m-0 mt-1 text-[40px] leading-none font-extrabold tracking-tight">
              {U(T.vested)}{" "}
              <span className="text-base font-medium text-mute">shares</span>
            </p>
            <div className="mt-3">
              <SummaryRow
                label="In your account"
                value={`${tilde(T.pastEst)}${U(T.pastNet)}`}
                detail={money(usd(T.pastNet))}
              />
              <SummaryRow
                label="Sold for tax"
                value={`${tilde(T.pastEst)}${U(T.pastSold)}`}
              />
              <SummaryRow
                indent
                label="Tax"
                value={`${tilde(T.pastEst)}${U(T.pastTax)}`}
                detail={money(T.pastTaxUsd)}
              />
              <SummaryRow
                indent
                label="Paid in salary"
                value={`${tilde(T.pastEst)}${money(T.pastSalaryUsd)}`}
              />
            </div>
          </section>

          <section className="rounded-lg border border-rule bg-card px-5 py-4">
            <h2 className="m-0 text-sm font-semibold tracking-wide text-mute uppercase">
              Still to vest
            </h2>
            <p className="m-0 mt-1 text-[40px] leading-none font-extrabold tracking-tight">
              {U(T.unvested)}{" "}
              <span className="text-base font-medium text-mute">shares</span>
            </p>
            <div className="mt-3">
              <SummaryRow
                label="You keep"
                value={`~${U(T.futNet)}`}
                detail={money(usd(T.futNet))}
              />
              <SummaryRow label="Sold for tax" value={`~${U(T.futSold)}`} />
              <SummaryRow
                indent
                label="Tax"
                value={`~${U(T.futTax)}`}
                detail={money(usd(T.futTax))}
              />
              <SummaryRow
                indent
                label="Paid in salary"
                value={`~${money(usd(T.futSalary))}`}
              />
            </div>
            {next && (
              <p className="m-0 mt-3 text-sm leading-normal text-mute">
                <span className="font-semibold text-ink">
                  Next {fmtDate(next.date)}
                </span>
                {" · "}
                {next.days} day{next.days === 1 ? "" : "s"}
                {" · "}
                {U(next.qty)} vesting, you keep ~{U(next.net)}
              </p>
            )}
          </section>
        </div>

        <div
          className="relative mt-10 flex h-8 rounded bg-rule"
          role="img"
          aria-label="Share breakdown"
        >
          <div
            className="h-full rounded-l"
            style={{ width: `${pct(T.pastTax)}%`, background: C.tax }}
          />
          <div
            className="h-full"
            style={{ width: `${pct(T.pastSalary)}%`, background: C.pay }}
          />
          <div
            className="h-full"
            style={{ width: `${pct(T.pastNet)}%`, background: C.got }}
          />
          <div
            className="h-full"
            style={{ width: `${pct(T.futNet)}%`, background: C.fGot }}
          />
          <div
            className="h-full"
            style={{ width: `${pct(T.futSalary)}%`, background: C.fPay }}
          />
          <div
            className="h-full rounded-r"
            style={{ width: `${pct(T.futTax)}%`, background: C.fTax }}
          />
          <div
            className="absolute -top-2.5 -bottom-2.5 w-0.5 bg-gold"
            style={{ left: `calc(${pct(T.vested)}% - 1px)` }}
          >
            <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs font-bold whitespace-nowrap text-gold">
              Today
            </span>
          </div>
        </div>
        <div className="mt-3">
          <ColorKey />
        </div>
        <p className="mt-3 max-w-[70ch] text-[13px] leading-normal text-mute">
          {U(T.pastNet)} in your account + {U(T.pastSold)} sold +{" "}
          {U(T.unvested)} still to vest = {U(T.granted)} granted. Tax is{" "}
          {(taxRate * 100).toFixed(1)}%. A partial share is still sold whole,
          and the leftover cash is paid in salary.
          {settings.useHistRate && histRate != null
            ? ` Future sales use the ${(rate * 100).toFixed(1)}% sold so far.`
            : ""}
        </p>
        {mismatch.length > 0 && (
          <p className="text-[13px] text-tax">
            Grant {mismatch.map((g) => g.grantNumber).join(", ")}: the vest
            schedule doesn't add up to the granted total. Check the Grants tab.
          </p>
        )}
      </section>

      <section className="mt-11">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2.5">
          <h2 className="m-0 text-xl font-bold tracking-tight">
            Vests by quarter
          </h2>
          <div
            className="inline-flex overflow-hidden rounded-md border border-rule"
            role="group"
            aria-label="Show chart in"
          >
            {(
              [
                ["units", "Units"],
                ["usd", "USD"],
                ["inr", "INR"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                aria-pressed={unit === k}
                className={`px-3 py-1.5 text-[13px] ${unit === k ? "bg-ink text-white" : "bg-card text-mute"} ${focus}`}
                onClick={() => setUnit(k)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-rule bg-card px-2 pt-4 pb-1">
          {chartReady ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={quarters.map((q) => ({
                  k: q.k,
                  pastNet: conv(q.pastNet),
                  pastTax: conv(q.pastTax),
                  pastSalary: conv(q.pastSalary),
                  futNet: conv(q.futNet),
                  futTax: conv(q.futTax),
                  futSalary: conv(q.futSalary),
                }))}
              >
                <CartesianGrid vertical={false} stroke={C.rule} />
                <XAxis
                  dataKey="k"
                  tick={{ fontSize: 11, fill: C.mute }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: C.mute }}
                  width={70}
                  tickFormatter={(v: number) =>
                    unit === "units"
                      ? U(v)
                      : unit === "usd"
                        ? `$${Math.round(v / 1000)}k`
                        : `₹${(v / 1e5).toFixed(1)}L`
                  }
                />
                <Tooltip
                  formatter={(value, name) => {
                    const numeric =
                      typeof value === "number" ? value : Number(value ?? 0);
                    const key = String(name ?? "");
                    const labels: Record<string, string> = {
                      pastNet: "Received",
                      pastTax: "Tax",
                      pastSalary: "In salary",
                      futNet: "To receive",
                      futTax: "Future tax",
                      futSalary: "Future salary",
                    };
                    return [fmtConv(numeric), labels[key] ?? key];
                  }}
                />
                <Bar dataKey="pastTax" stackId="a" fill={C.tax} />
                <Bar dataKey="pastSalary" stackId="a" fill={C.pay} />
                <Bar dataKey="pastNet" stackId="a" fill={C.got} />
                <Bar dataKey="futNet" stackId="a" fill={C.fGot} />
                <Bar dataKey="futSalary" stackId="a" fill={C.fPay} />
                <Bar dataKey="futTax" stackId="a" fill={C.fTax} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-70" />
          )}
          <div className="px-3 pb-3">
            <ColorKey />
          </div>
        </div>
      </section>

      <section className="mt-11">
        <div
          className="mb-3.5 flex flex-wrap gap-1 border-b border-rule"
          role="tablist"
          onKeyDown={(event) => {
            const keys: Tab[] = ["upcoming", "past", "fy", "grants"];
            const index = keys.indexOf(tab);
            let next: Tab | undefined;
            switch (event.key) {
              case "ArrowRight":
                next = keys[(index + 1) % keys.length];
                break;
              case "ArrowLeft":
                next = keys[(index - 1 + keys.length) % keys.length];
                break;
              case "Home":
                next = keys[0];
                break;
              case "End":
                next = keys[keys.length - 1];
                break;
              default:
                return;
            }
            if (!next) return;
            event.preventDefault();
            setTab(next);
            tabRefs.current[next]?.focus();
          }}
        >
          {(
            [
              ["upcoming", "Upcoming vests"],
              ["past", "Past vests"],
              ["fy", "By Indian FY"],
              ["grants", "Grants"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              ref={(node) => {
                if (node) tabRefs.current[k] = node;
                else delete tabRefs.current[k];
              }}
              id={`tab-${k}`}
              type="button"
              role="tab"
              aria-selected={tab === k}
              aria-controls="ledger-panel"
              tabIndex={tab === k ? 0 : -1}
              className={`border-b-[3px] px-3 py-2.5 text-sm font-semibold ${tab === k ? "border-ink text-ink" : "border-transparent text-mute"} ${focus}`}
              onClick={() => setTab(k)}
            >
              {label}
            </button>
          ))}
        </div>

        <div id="ledger-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
          {tab === "upcoming" || tab === "past" ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse overflow-hidden rounded-lg border border-rule bg-card text-sm">
                <thead>
                  <tr>
                    {[
                      "Vest date",
                      "Grant",
                      "Vesting",
                      "Shares sold",
                      "Tax",
                      "In salary",
                      "You keep",
                    ].map((h) => (
                      <th
                        key={h}
                        scope="col"
                        className="border-b border-rule bg-[#fafbfa] px-3.5 py-2.5 text-right text-[13px] font-semibold text-mute first:text-left"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {vestRows.map((r) => (
                    <tr key={r.grantId + r.date}>
                      <td className="border-b border-rule px-3.5 py-2.5 text-left">
                        {fmtDate(r.date)}
                      </td>
                      <td className="border-b border-rule px-3.5 py-2.5 text-left">
                        {r.grant}
                      </td>
                      <td className="border-b border-rule px-3.5 py-2.5 text-right">
                        {U(r.qty)}
                      </td>
                      <td className="border-b border-rule px-3.5 py-2.5 text-right">
                        {tab === "past" ? (
                          <input
                            className={`${field} w-20 text-right`}
                            type="number"
                            min="0"
                            aria-label={`Shares sold for tax on ${r.date}`}
                            value={r.est ? "" : r.withheld}
                            placeholder={`~${r.withheld}`}
                            onChange={(e) =>
                              setWithheld(r.grantId, r.idx, e.target.value)
                            }
                          />
                        ) : (
                          <span className="text-mute">~{U(r.withheld)}</span>
                        )}
                      </td>
                      <td
                        className={`border-b border-rule px-3.5 py-2.5 text-right ${r.est ? "text-mute" : ""}`}
                      >
                        {r.est ? "~" : ""}
                        {U(r.taxShares)}
                      </td>
                      <td className="border-b border-rule px-3.5 py-2.5 text-right">
                        {r.est ? "~" : ""}
                        {USD(
                          (r.fmv ?? price) == null
                            ? null
                            : r.salaryShares * (r.fmv ?? price ?? 0),
                        )}
                      </td>
                      <td
                        className={`border-b border-rule px-3.5 py-2.5 text-right ${r.est ? "text-mute" : ""}`}
                      >
                        {r.est ? "~" : ""}
                        {U(r.net)}
                        <div className="text-[12px] leading-tight whitespace-nowrap text-mute">
                          {USD(usd(r.net))} · {INR(inr(r.net))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {tab === "past" && (
                <p className="mt-2 max-w-[80ch] text-[13px] leading-normal text-mute">
                  Shares sold is the whole number from each E*TRADE release. Tax
                  is your rate times the vest. Anything left from the last share
                  is cash in that month's salary. Blank rows are estimates,
                  shown with ~.
                </p>
              )}
            </div>
          ) : tab === "fy" ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse overflow-hidden rounded-lg border border-rule bg-card text-sm">
                <thead>
                  <tr>
                    {[
                      "Financial year",
                      "Vests",
                      "Vesting",
                      "Sold",
                      "Tax",
                      "In salary",
                      "You keep",
                      "Status",
                    ].map((h) => (
                      <th
                        key={h}
                        scope="col"
                        className="border-b border-rule bg-[#fafbfa] px-3.5 py-2.5 text-right text-[13px] font-semibold text-mute first:text-left"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fy.map((f) => (
                    <tr key={f.fy}>
                      <td className="border-b border-rule px-3.5 py-2.5 text-left">
                        {f.fy}
                      </td>
                      <td className="border-b border-rule px-3.5 py-2.5 text-right">
                        {f.count}
                      </td>
                      <td className="border-b border-rule px-3.5 py-2.5 text-right">
                        {U(f.qty)}
                      </td>
                      <td className="border-b border-rule px-3.5 py-2.5 text-right">
                        {U(f.sold)}
                      </td>
                      <td className="border-b border-rule px-3.5 py-2.5 text-right">
                        {U(f.tax)}
                      </td>
                      <td className="border-b border-rule px-3.5 py-2.5 text-right">
                        {U(f.salary)}
                      </td>
                      <td className="border-b border-rule px-3.5 py-2.5 text-right">
                        {U(f.net)}
                      </td>
                      <td className="border-b border-rule px-3.5 py-2.5 text-right">
                        {f.fut === 0
                          ? "Done"
                          : f.past === 0
                            ? "Upcoming"
                            : "In progress"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 max-w-[80ch] text-[13px] leading-normal text-mute">
                April to March, matching Indian income tax years. Useful for
                Schedule FA and ITR prep; use vest-date values from Form 16 when
                filing.
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse overflow-hidden rounded-lg border border-rule bg-card text-sm">
                  <thead>
                    <tr>
                      {[
                        "Grant",
                        "Granted on",
                        "Granted",
                        "Scheduled",
                        "Vested",
                        "Unvested",
                        "Progress",
                        "",
                      ].map((h) => (
                        <th
                          key={h || "actions"}
                          scope="col"
                          className="border-b border-rule bg-[#fafbfa] px-3.5 py-2.5 text-right text-[13px] font-semibold text-mute first:text-left"
                        >
                          {h || <span className="sr-only">Actions</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {grants.map((g) => {
                      const t = today0();
                      const sch = g.vests.reduce((a, v) => a + v.qty, 0);
                      const vd = g.vests
                        .filter((v) => {
                          const d = toDate(v.date);
                          return d != null && d <= t;
                        })
                        .reduce((a, v) => a + v.qty, 0);
                      return (
                        <tr key={g.id}>
                          <td className="border-b border-rule px-3.5 py-2.5 text-left">
                            {g.grantNumber}
                          </td>
                          <td className="border-b border-rule px-3.5 py-2.5 text-right">
                            {fmtDate(g.grantDate)}
                          </td>
                          <td className="border-b border-rule px-3.5 py-2.5 text-right">
                            {U(g.granted)}
                          </td>
                          <td
                            className={`border-b border-rule px-3.5 py-2.5 text-right ${Math.abs(sch - g.granted) > 0.5 ? "text-tax" : ""}`}
                          >
                            {U(sch)}
                          </td>
                          <td className="border-b border-rule px-3.5 py-2.5 text-right">
                            {U(vd)}
                          </td>
                          <td className="border-b border-rule px-3.5 py-2.5 text-right">
                            {U(sch - vd)}
                          </td>
                          <td className="min-w-30 border-b border-rule px-3.5 py-2.5">
                            <div
                              className="h-2 rounded bg-rule"
                              aria-hidden="true"
                            >
                              <div
                                className="h-full rounded bg-got"
                                style={{
                                  width: `${sch ? (vd / sch) * 100 : 0}%`,
                                }}
                              />
                            </div>
                          </td>
                          <td className="border-b border-rule px-3.5 py-2.5 text-right">
                            <button
                              type="button"
                              className={`${btnGhost} ${btnSmall}`}
                              onClick={() => {
                                if (confirm(`Remove grant ${g.grantNumber}?`)) {
                                  setGrants((gs) =>
                                    gs.filter((x) => x.id !== g.id),
                                  );
                                }
                              }}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <AddGrant
                symbol={settings.symbol}
                onAdd={(g) =>
                  setGrants((gs) => [...gs.filter((x) => x.id !== g.id), g])
                }
              />
            </>
          )}
        </div>
      </section>

      <section className="mt-11">
        <details className="rounded-lg border border-rule bg-card px-4 py-3.5">
          <summary className={`cursor-pointer font-bold ${focus}`}>
            Assumptions and data
          </summary>
          <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
            <label className="flex flex-col gap-1 text-[13px] text-mute">
              Ticker
              <input
                className={field}
                value={settings.symbol}
                onChange={(e) =>
                  setSettings((s) =>
                    s
                      ? {
                          ...s,
                          symbol: e.target.value.toUpperCase(),
                          fetchedAt: null,
                        }
                      : s,
                  )
                }
              />
            </label>
            <label className="flex flex-col gap-1 text-[13px] text-mute">
              Share price (USD)
              <input
                className={field}
                type="number"
                step="0.01"
                value={price ?? ""}
                onChange={(e) =>
                  setSettings((s) =>
                    s
                      ? {
                          ...s,
                          price: e.target.value === "" ? null : +e.target.value,
                          manualPrice: true,
                        }
                      : s,
                  )
                }
              />
            </label>
            <label className="flex flex-col gap-1 text-[13px] text-mute">
              USD to INR
              <input
                className={field}
                type="number"
                step="0.01"
                value={fx ?? ""}
                onChange={(e) =>
                  setSettings((s) =>
                    s
                      ? {
                          ...s,
                          usdinr:
                            e.target.value === "" ? null : +e.target.value,
                          manualPrice: true,
                        }
                      : s,
                  )
                }
              />
            </label>
            <label className="flex flex-col gap-1 text-[13px] text-mute">
              Tax rate for estimates (%)
              <input
                className={field}
                type="number"
                step="0.1"
                value={settings.taxRate}
                onChange={(e) =>
                  setSettings((s) =>
                    s ? { ...s, taxRate: +e.target.value } : s,
                  )
                }
              />
            </label>
            <label className="col-span-full flex flex-row items-center gap-2 text-[13px] text-ink">
              <input
                type="checkbox"
                checked={settings.useHistRate}
                onChange={(e) =>
                  setSettings((s) =>
                    s ? { ...s, useHistRate: e.target.checked } : s,
                  )
                }
              />
              Estimate future sales from shares sold so far
              {histRate != null
                ? ` (${(histRate * 100).toFixed(1)}% sold)`
                : ""}
            </label>
          </div>
          <p className="mt-2 max-w-[80ch] text-[13px] leading-normal text-mute">
            Common Indian rates: 31.2% (30% slab + 4% cess), 34.32% (10%
            surcharge, income ₹50L to ₹1Cr), 35.88% (15% surcharge, ₹1Cr to
            ₹2Cr), 39% (25% surcharge, above ₹2Cr). A fraction of a share still
            sells one whole share; the unused cash is paid in salary. USD/INR is
            the live spot quote, the same interbank rate E*TRADE uses, not the
            SBI rate on your tax return. Typing a price or a rate pauses
            automatic updates until you click Refresh price.{" "}
            {settings.asOf ? `Source: ${settings.asOf}.` : ""}
          </p>
          <p className="mt-2 max-w-[80ch] text-[13px] leading-normal text-mute">
            The ledger stays in this browser. Download a backup if you want a
            copy you can restore later. Nothing is saved on the server.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            <button type="button" className={btnGhost} onClick={exportBackup}>
              Download backup
            </button>
            <button
              type="button"
              className={btnGhost}
              onClick={() => backupRef.current?.click()}
            >
              Restore backup
            </button>
            <input
              ref={backupRef}
              type="file"
              accept=".json"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importBackup(file);
              }}
            />
            <button
              type="button"
              className={btnGhost}
              onClick={() => {
                if (confirm("Delete all grants from this dashboard?"))
                  setGrants([]);
              }}
            >
              Clear all grants
            </button>
          </div>
        </details>
      </section>
      {guide}
    </main>
  );
}

function AddGrant({
  onAdd,
  symbol,
}: {
  onAdd: (grant: Grant) => void;
  symbol: string;
}) {
  const blank = {
    grantNumber: "",
    grantDate: "",
    total: "",
    first: "",
    every: 3,
    count: "16",
  };
  const [f, setF] = useState(blank);
  const [open, setOpen] = useState(false);
  const total = Number(f.total);
  const count = Number(f.count);
  const ok = Boolean(f.grantNumber && total > 0 && f.first && count > 0);
  if (!open) {
    return (
      <div className="mt-4">
        <button
          type="button"
          className={btnGhost}
          onClick={() => setOpen(true)}
        >
          Add a grant manually
        </button>
      </div>
    );
  }
  return (
    <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3 rounded-lg border border-rule bg-card p-4">
      <label className="flex flex-col gap-1 text-[13px] text-mute">
        Grant number
        <input
          className={field}
          value={f.grantNumber}
          onChange={(e) => setF({ ...f, grantNumber: e.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px] text-mute">
        Grant date
        <input
          className={field}
          type="date"
          value={f.grantDate}
          onChange={(e) => setF({ ...f, grantDate: e.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px] text-mute">
        Total shares
        <input
          className={field}
          type="number"
          value={f.total}
          onChange={(e) => setF({ ...f, total: e.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px] text-mute">
        First vest date
        <input
          className={field}
          type="date"
          value={f.first}
          onChange={(e) => setF({ ...f, first: e.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px] text-mute">
        Vests every
        <select
          className={field}
          value={f.every}
          onChange={(e) => setF({ ...f, every: Number(e.target.value) })}
        >
          <option value={1}>month</option>
          <option value={3}>quarter</option>
          <option value={6}>6 months</option>
          <option value={12}>year</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-[13px] text-mute">
        Number of vests
        <input
          className={field}
          type="number"
          value={f.count}
          onChange={(e) => setF({ ...f, count: e.target.value })}
        />
      </label>
      <div className="flex items-end gap-2.5">
        <button
          type="button"
          className={btn}
          disabled={!ok}
          onClick={() => {
            onAdd({
              id: f.grantNumber,
              grantNumber: f.grantNumber,
              grantDate: f.grantDate,
              symbol,
              granted: total,
              withheldTotal: 0,
              vests: genSchedule({
                total,
                first: f.first,
                every: f.every,
                count,
              }),
            });
            setOpen(false);
            setF(blank);
          }}
        >
          Add grant
        </button>
        <button
          type="button"
          className={btnGhost}
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
