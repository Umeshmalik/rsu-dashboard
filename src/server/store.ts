import "server-only";

import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { iso, mergeGrants } from "~/lib/rsu";
import { defaultSettings, type Db, type Grant, type LastImport, type Settings } from "~/lib/types";
import { parseFile } from "~/server/parse";
import { getQuote } from "~/server/quote";

const QUOTE_CACHE_MS = 10 * 60 * 1000;

type Listener = (event: string, data: unknown) => void;

interface Runtime {
  db: Db;
  loaded: boolean;
  loading: Promise<void> | null;
  chain: Promise<void>;
  listeners: Set<Listener>;
  watching: boolean;
  backgroundStarted: boolean;
  quoteAt: number;
  timers: Map<string, NodeJS.Timeout>;
  quoteTimer: NodeJS.Timeout | null;
  dataDir: string;
}

const g = globalThis as typeof globalThis & { __rsuRuntime?: Runtime };

function freshDb(): Db {
  return {
    grants: [],
    settings: defaultSettings(),
    meta: { processed: {}, lastImport: null },
  };
}

function runtime(): Runtime {
  g.__rsuRuntime ??= {
    db: freshDb(),
    loaded: false,
    loading: null,
    chain: Promise.resolve(),
    listeners: new Set(),
    watching: false,
    backgroundStarted: false,
    quoteAt: 0,
    timers: new Map(),
    quoteTimer: null,
    dataDir: process.env.RSU_DATA_DIR ?? path.join(process.cwd(), "data"),
  };
  return g.__rsuRuntime;
}

export function resetStore(dataDir: string): void {
  const prev = g.__rsuRuntime;
  if (prev?.quoteTimer) clearInterval(prev.quoteTimer);
  if (prev) {
    for (const timer of prev.timers.values()) clearTimeout(timer);
  }
  process.env.RSU_DATA_DIR = dataDir;
  g.__rsuRuntime = undefined;
}

function paths() {
  const dataDir = runtime().dataDir;
  return {
    dataDir,
    dbFile: path.join(dataDir, "db.json"),
    backupDir: path.join(dataDir, "backups"),
    watchDir: process.env.RSU_WATCH_DIR ?? path.join(os.homedir(), "Downloads"),
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

async function load(): Promise<void> {
  const rt = runtime();
  const { dbFile } = paths();
  try {
    const raw: unknown = JSON.parse(await fsp.readFile(dbFile, "utf8"));
    if (!isRecord(raw)) {
      rt.db = freshDb();
    } else {
      const settings = isRecord(raw.settings) ? raw.settings : {};
      const meta = isRecord(raw.meta) ? raw.meta : {};
      rt.db = {
        grants: Array.isArray(raw.grants) ? (raw.grants as Grant[]) : [],
        settings: { ...defaultSettings(), ...(settings as Partial<Settings>) },
        meta: {
          processed: isRecord(meta.processed)
            ? (meta.processed as Record<string, number>)
            : {},
          lastImport: (meta.lastImport ?? null) as LastImport | null,
        },
      };
    }
  } catch {
    rt.db = freshDb();
  }
  rt.loaded = true;
}

export function ensureLoaded(): Promise<void> {
  const rt = runtime();
  if (rt.loaded) return Promise.resolve();
  rt.loading ??= load().finally(() => {
    runtime().loading = null;
  });
  return rt.loading;
}

function save(): Promise<void> {
  const rt = runtime();
  rt.chain = rt.chain
    .then(async () => {
      const { dbFile, backupDir } = paths();
      await fsp.mkdir(backupDir, { recursive: true });
      const tmp = `${dbFile}.tmp`;
      await fsp.writeFile(tmp, JSON.stringify(rt.db, null, 2));
      await fsp.rename(tmp, dbFile);
      const daily = path.join(backupDir, `db-${iso(new Date())}.json`);
      if (!fs.existsSync(daily)) await fsp.copyFile(dbFile, daily);
    })
    .catch((e: unknown) => {
      const message = e instanceof Error ? e.message : String(e);
      console.error("[db] save failed:", message);
    });
  return rt.chain;
}

function broadcast(event: string, data: unknown): void {
  for (const listener of runtime().listeners) {
    try {
      listener(event, data);
    } catch {
      runtime().listeners.delete(listener);
    }
  }
}

export function addListener(listener: Listener): () => void {
  runtime().listeners.add(listener);
  return () => {
    runtime().listeners.delete(listener);
  };
}

export function publicState() {
  const rt = runtime();
  const { watchDir, dbFile } = paths();
  return {
    grants: rt.db.grants,
    settings: rt.db.settings,
    meta: {
      lastImport: rt.db.meta.lastImport,
      watchDir,
      watching: rt.watching,
      dataFile: dbFile,
    },
  };
}

export async function replaceState(grants: Grant[], settings: Settings): Promise<void> {
  const rt = runtime();
  await ensureLoaded();
  rt.db.grants = grants;
  rt.db.settings = { ...defaultSettings(), ...settings };
  await save();
}

export async function applyImport(
  parsed: Grant[],
  file: string,
  via: LastImport["via"],
): Promise<LastImport> {
  const rt = runtime();
  await ensureLoaded();
  rt.db.grants = mergeGrants(rt.db.grants, parsed);
  const sym = parsed.find((grant) => grant.symbol)?.symbol;
  if (sym && sym !== rt.db.settings.symbol) {
    rt.db.settings.symbol = sym;
    rt.db.settings.fetchedAt = null;
  }
  const lastImport: LastImport = {
    at: Date.now(),
    file,
    via,
    grants: parsed.length,
    vests: parsed.reduce((sum, grant) => sum + grant.vests.length, 0),
  };
  rt.db.meta.lastImport = lastImport;
  broadcast("import", lastImport);
  await save();
  return lastImport;
}

export async function refreshQuote(force = false): Promise<Settings> {
  const rt = runtime();
  await ensureLoaded();
  if (!force && rt.db.settings.manualPrice) return rt.db.settings;
  if (!force && Date.now() - rt.quoteAt < QUOTE_CACHE_MS && rt.db.settings.price) {
    return rt.db.settings;
  }
  const q = await getQuote(rt.db.settings.symbol);
  rt.quoteAt = Date.now();
  rt.db.settings = {
    ...rt.db.settings,
    ...q,
    fetchedAt: Date.now(),
    manualPrice: false,
  };
  await save();
  broadcast("quote", rt.db.settings);
  return rt.db.settings;
}

const WATCH_RE = /^(ByBenefitType|ByStatus|BenefitHistory|StockPlan).*\.(xlsx|xls|csv)$/i;
const QUOTE_EVERY_MS = 15 * 60 * 1000;

async function processFile(full: string): Promise<void> {
  const name = path.basename(full);
  const rt = runtime();
  await ensureLoaded();
  try {
    const st = await fsp.stat(full);
    if (rt.db.meta.processed[name] === st.mtimeMs) return;
    const parsed = parseFile(await fsp.readFile(full));
    rt.db.meta.processed[name] = st.mtimeMs;
    if (parsed.length === 0) {
      console.log(`[watch] ${name}: no RSU grants found, skipped`);
      await save();
      return;
    }
    const imported = await applyImport(parsed, name, "watch");
    console.log(
      `[watch] imported ${name}: ${imported.grants} grants, ${imported.vests} vest dates`,
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[watch] ${name}: ${message}`);
  }
}

function startWatch(): void {
  const { watchDir } = paths();
  if (!fs.existsSync(watchDir)) {
    console.warn(`[watch] ${watchDir} not found; auto-import is off`);
    return;
  }
  const rt = runtime();
  try {
    fs.watch(watchDir, (_event, name) => {
      if (!name || !WATCH_RE.test(name)) return;
      const pending = rt.timers.get(name);
      if (pending) clearTimeout(pending);
      rt.timers.set(
        name,
        setTimeout(() => {
          rt.timers.delete(name);
          const full = path.join(watchDir, name);
          if (fs.existsSync(full)) void processFile(full);
        }, 1500),
      );
    });
    rt.watching = true;
    const newest = fs
      .readdirSync(watchDir)
      .filter((n) => WATCH_RE.test(n))
      .map((n) => ({ n, m: fs.statSync(path.join(watchDir, n)).mtimeMs }))
      .sort((a, b) => b.m - a.m)[0];
    if (newest) void processFile(path.join(watchDir, newest.n));
    console.log(`[watch] watching ${watchDir} for E*TRADE exports`);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn(`[watch] can't watch ${watchDir}: ${message}`);
  }
}

export async function startBackground(): Promise<void> {
  if (process.env.NODE_ENV === "test") return;
  const rt = runtime();
  if (rt.backgroundStarted) return;
  rt.backgroundStarted = true;
  await ensureLoaded();
  startWatch();
  const timer = setInterval(() => {
    if (runtime().db.grants.length > 0) {
      refreshQuote().catch((e: unknown) => {
        const message = e instanceof Error ? e.message : String(e);
        console.warn("[quote]", message);
      });
    }
  }, QUOTE_EVERY_MS);
  timer.unref();
  runtime().quoteTimer = timer;
}
