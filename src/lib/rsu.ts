import type { Grant, Settings, Vest } from "~/lib/types";

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

export function toDate(v: unknown): Date | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) {
    return Number.isNaN(v.getTime())
      ? null
      : new Date(v.getFullYear(), v.getMonth(), v.getDate());
  }
  if (typeof v === "number") {
    const d = new Date(Math.round((v - 25569) * 864e5));
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  const s = String(v).trim();
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s);
  if (m?.[1] && m[2] && m[3]) {
    let y = +m[3];
    if (y < 100) y += 2000;
    return new Date(y, +m[1] - 1, +m[2]);
  }
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m?.[1] && m[2] && m[3]) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = /^(\d{1,2})[-\s]([A-Za-z]{3})[A-Za-z]*[-\s,]+(\d{2,4})$/.exec(s);
  if (m?.[1] && m[2] && m[3]) {
    let y = +m[3];
    if (y < 100) y += 2000;
    const mo = MONTHS[m[2].toLowerCase()];
    if (mo != null) return new Date(y, mo, +m[1]);
  }
  m = /^([A-Za-z]{3})[A-Za-z]*\s+(\d{1,2}),?\s+(\d{4})$/.exec(s);
  if (m?.[1] && m[2] && m[3]) {
    const mo = MONTHS[m[1].toLowerCase()];
    if (mo != null) return new Date(+m[3], mo, +m[2]);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime())
    ? null
    : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function iso(d: unknown): string {
  const x = d instanceof Date ? d : toDate(d);
  if (!x) return "";
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

export function today0(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function num(v: unknown): number {
  if (typeof v === "number") return v;
  const n = Number.parseFloat(String(v ?? "").replace(/[,$\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function fyOf(d: Date): string {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `FY ${String(y).slice(2)}-${String(y + 1).slice(2)}`;
}

export function fmtDate(d: unknown): string {
  if (d == null || d === "") return "—";
  const x = toDate(d);
  if (!x) return "—";
  return x.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function U(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(
    n || 0,
  );
}

export function USD(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export function INR(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function genSchedule(input: {
  total: number;
  first: string;
  every: number;
  count: number;
}): Vest[] {
  const { total, first, every, count } = input;
  if (count < 1) return [];
  const base = Math.floor(total / count);
  const d0 = toDate(first);
  if (!d0) return [];
  const vs: Vest[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(d0.getFullYear(), d0.getMonth() + every * i, d0.getDate());
    vs.push({
      date: iso(d),
      qty: i === count - 1 ? total - base * (count - 1) : base,
      withheld: null,
      src: "manual",
    });
  }
  return vs;
}

export function mergeGrants(old: Grant[], parsed: Grant[]): Grant[] {
  const map = new Map(old.map((g) => [g.id, g]));
  for (const g of parsed) {
    const prev = map.get(g.id);
    if (prev) {
      for (const v of g.vests) {
        const pv = prev.vests.find((x) => x.date === v.date);
        if (
          pv?.src === "edited" &&
          (v.withheld == null || v.src === "allocated")
        ) {
          v.withheld = pv.withheld;
          v.src = "edited";
        }
      }
    }
    map.set(g.id, g);
  }
  return [...map.values()];
}

export interface ComputedRow {
  date: string;
  qty: number;
  /** Whole shares sold to cover tax. */
  withheld: number;
  /** Tax owed, in share units. Can be fractional. */
  taxShares: number;
  /** Leftover of the last sold share, paid as cash in salary. */
  salaryShares: number;
  fmv: number | null;
  src: Vest["src"];
  idx: number;
  d: Date;
  past: boolean;
  est: boolean;
  net: number;
  grantId: string;
  grant: string;
}

export interface NextVest {
  date: string;
  qty: number;
  net: number;
  sold: number;
  salaryShares: number;
  days: number;
}

export interface FyRow {
  fy: string;
  count: number;
  qty: number;
  sold: number;
  tax: number;
  salary: number;
  net: number;
  past: number;
  fut: number;
}

export interface QuarterRow {
  k: string;
  pastNet: number;
  pastTax: number;
  pastSalary: number;
  futNet: number;
  futTax: number;
  futSalary: number;
}

export interface Totals {
  granted: number;
  vested: number;
  unvested: number;
  /** Whole shares already sold to cover tax. */
  pastSold: number;
  /** Tax owed on vested shares, in share units. */
  pastTax: number;
  /** Cash from sold shares that was paid through salary, in share units. */
  pastSalary: number;
  /** Tax cash at each vest's release price, or today's price when that is missing. */
  pastTaxUsd: number | null;
  pastSalaryUsd: number | null;
  pastNet: number;
  futSold: number;
  futTax: number;
  futSalary: number;
  futNet: number;
  pastEst: boolean;
}

/** Shares are sold in whole units. A fraction of a share still sells the next full share. */
export function wholeSharesSold(qty: number, rate: number): number {
  if (!(qty > 0) || !(rate > 0)) return 0;
  const sold = Math.ceil(qty * rate - 1e-9);
  return Math.min(qty, sold);
}

export interface Computed {
  rows: ComputedRow[];
  T: Totals;
  /** Rate used to estimate how many whole shares future vests will sell. */
  rate: number;
  /** Statutory tax rate, as a fraction. Splits a sale into tax and salary cash. */
  taxRate: number;
  histRate: number | null;
  next: NextVest | null;
  fy: FyRow[];
  quarters: QuarterRow[];
  scheduled: number;
}

export function compute(grants: Grant[], s: Settings): Computed {
  const t = today0();
  let hq = 0;
  let hw = 0;
  for (const g of grants) {
    for (const v of g.vests) {
      const vd = toDate(v.date);
      if (vd && vd <= t && v.withheld != null) {
        hq += v.qty;
        hw += v.withheld;
      }
    }
  }
  const histRate = hq ? hw / hq : null;
  const taxRate = s.taxRate / 100;
  const sellRate = s.useHistRate && histRate != null ? histRate : taxRate;

  const rows: ComputedRow[] = [];
  for (const g of grants) {
    g.vests.forEach((v, i) => {
      const d = toDate(v.date);
      if (!d) return;
      const past = d <= t;
      const est = v.withheld == null;
      const withheld = v.withheld ?? wholeSharesSold(v.qty, sellRate);
      const taxShares = Math.min(Math.max(0, v.qty * taxRate), withheld);
      const salaryShares = Math.max(0, withheld - taxShares);
      const fmv = v.fmv != null && v.fmv > 0 ? v.fmv : null;
      rows.push({
        date: v.date,
        qty: v.qty,
        src: v.src,
        idx: i,
        d,
        past,
        est,
        withheld,
        taxShares,
        salaryShares,
        fmv,
        net: v.qty - withheld,
        grantId: g.id,
        grant: g.grantNumber,
      });
    });
  }
  rows.sort((a, b) => a.d.getTime() - b.d.getTime());

  const T: Totals = {
    granted: 0,
    vested: 0,
    unvested: 0,
    pastSold: 0,
    pastTax: 0,
    pastSalary: 0,
    pastTaxUsd: null,
    pastSalaryUsd: null,
    pastNet: 0,
    futSold: 0,
    futTax: 0,
    futSalary: 0,
    futNet: 0,
    pastEst: false,
  };
  for (const g of grants) T.granted += g.granted;
  let pastTaxUsd = 0;
  let pastSalaryUsd = 0;
  let pastCash = true;
  for (const r of rows) {
    if (r.past) {
      T.vested += r.qty;
      T.pastSold += r.withheld;
      T.pastTax += r.taxShares;
      T.pastSalary += r.salaryShares;
      T.pastNet += r.net;
      if (r.est) T.pastEst = true;
      const px = r.fmv ?? s.price;
      if (px == null) pastCash = false;
      else {
        pastTaxUsd += r.taxShares * px;
        pastSalaryUsd += r.salaryShares * px;
      }
    } else {
      T.unvested += r.qty;
      T.futSold += r.withheld;
      T.futTax += r.taxShares;
      T.futSalary += r.salaryShares;
      T.futNet += r.net;
    }
  }
  if (pastCash) {
    T.pastTaxUsd = pastTaxUsd;
    T.pastSalaryUsd = pastSalaryUsd;
  }

  let next: NextVest | null = null;
  const firstFut = rows.find((r) => !r.past);
  if (firstFut) {
    const same = rows.filter((r) => r.date === firstFut.date);
    next = {
      date: firstFut.date,
      qty: same.reduce((a, r) => a + r.qty, 0),
      net: same.reduce((a, r) => a + r.net, 0),
      sold: same.reduce((a, r) => a + r.withheld, 0),
      salaryShares: same.reduce((a, r) => a + r.salaryShares, 0),
      days: Math.round((firstFut.d.getTime() - t.getTime()) / 864e5),
    };
  }

  const fyMap: Record<string, FyRow> = {};
  for (const r of rows) {
    const k = fyOf(r.d);
    const existing = fyMap[k];
    const f: FyRow = existing ?? {
      fy: k,
      count: 0,
      qty: 0,
      sold: 0,
      tax: 0,
      salary: 0,
      net: 0,
      past: 0,
      fut: 0,
    };
    fyMap[k] = f;
    f.count++;
    f.qty += r.qty;
    f.sold += r.withheld;
    f.tax += r.taxShares;
    f.salary += r.salaryShares;
    f.net += r.net;
    if (r.past) f.past++;
    else f.fut++;
  }

  const qMap: Record<string, QuarterRow> = {};
  for (const r of rows) {
    const k = `${r.d.getFullYear()} Q${Math.floor(r.d.getMonth() / 3) + 1}`;
    const existing = qMap[k];
    const q: QuarterRow = existing ?? {
      k,
      pastNet: 0,
      pastTax: 0,
      pastSalary: 0,
      futNet: 0,
      futTax: 0,
      futSalary: 0,
    };
    qMap[k] = q;
    if (r.past) {
      q.pastNet += r.net;
      q.pastTax += r.taxShares;
      q.pastSalary += r.salaryShares;
    } else {
      q.futNet += r.net;
      q.futTax += r.taxShares;
      q.futSalary += r.salaryShares;
    }
  }

  const scheduled = rows.reduce((a, r) => a + r.qty, 0);
  return {
    rows,
    T,
    rate: sellRate,
    taxRate,
    histRate,
    next,
    fy: Object.values(fyMap),
    quarters: Object.values(qMap),
    scheduled,
  };
}

export const SAMPLE: Grant[] = [
  {
    id: "S-1001",
    grantNumber: "S-1001",
    grantDate: "2024-08-15",
    symbol: "EXPE",
    granted: 160,
    withheldTotal: 0,
    vests: genSchedule({ total: 160, first: "2024-11-15", every: 3, count: 16 }),
  },
  {
    id: "S-2002",
    grantNumber: "S-2002",
    grantDate: "2025-08-15",
    symbol: "EXPE",
    granted: 96,
    withheldTotal: 0,
    vests: genSchedule({ total: 96, first: "2025-11-15", every: 3, count: 12 }),
  },
];
