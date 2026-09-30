import "server-only";
import * as XLSX from "xlsx";

import { iso, num, toDate, today0 } from "~/lib/rsu";
import type { Grant, Vest } from "~/lib/types";

const norm = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

type Row = Record<string, unknown>;

function pick(row: Row, cands: string[], excl: string[] = []): unknown {
  const keys = Object.keys(row);
  for (const c of cands) {
    for (const k of keys) {
      const n = norm(k);
      const value = row[k];
      if (
        n.includes(c) &&
        !excl.some((e) => n.includes(e)) &&
        value !== "" &&
        value != null
      ) {
        return value;
      }
    }
  }
  return "";
}

function pickExact(row: Row, cands: string[]): unknown {
  const keys = Object.keys(row);
  for (const c of cands) {
    for (const k of keys) {
      const value = row[k];
      if (norm(k) === c && value !== "" && value != null) return value;
    }
  }
  return "";
}

function rememberVest(
  g: Grant,
  date: string,
  qty: number,
  withheld: number,
  fmv: number,
) {
  const ex = g.vests.find((v) => v.date === date);
  if (ex) {
    ex.qty = Math.max(ex.qty, qty);
    if (withheld > (ex.withheld ?? 0)) {
      ex.withheld = withheld;
      ex.src = "import";
    }
    if (fmv > 0) ex.fmv = fmv;
    return;
  }
  const vest: Vest = {
    date,
    qty,
    withheld: withheld > 0 ? withheld : null,
    src: "import",
  };
  if (fmv > 0) vest.fmv = fmv;
  g.vests.push(vest);
}

export interface SheetSummary {
  sheet: string;
  headers: string[];
  rows: number;
}

function workbook(buf: Buffer) {
  return XLSX.read(buf, { type: "buffer", cellDates: true });
}

export function headerSummary(buf: Buffer): SheetSummary[] {
  const wb = workbook(buf);
  return wb.SheetNames.map((name) => {
    const sheet = wb.Sheets[name];
    if (!sheet) return { sheet: name, headers: [], rows: 0 };
    const rows = XLSX.utils.sheet_to_json<Row>(sheet, {
      defval: "",
      raw: true,
    });
    const first = rows[0];
    return {
      sheet: name,
      headers: first ? Object.keys(first) : [],
      rows: rows.length,
    };
  });
}

export function parseFile(buf: Buffer): Grant[] {
  const wb = workbook(buf);
  const grants: Record<string, Grant> = {};
  let order = 0;
  const ensure = (gn: string): Grant => {
    const existing = grants[gn];
    if (existing) return existing;
    const created: Grant = {
      id: gn,
      grantNumber: gn,
      grantDate: "",
      symbol: "",
      granted: 0,
      withheldTotal: 0,
      vests: [],
    };
    grants[gn] = created;
    return created;
  };

  for (const name of wb.SheetNames) {
    if (/espp/i.test(name)) continue;
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<Row>(sheet, {
      defval: "",
      raw: true,
    });
    const first = rows[0];
    if (!first) continue;
    const headers = Object.keys(first).map(norm);
    const hasRT = headers.some((h) => h.includes("recordtype"));
    if (
      !hasRT &&
      !headers.some((h) => h.includes("vestdate") || h.includes("releasedate"))
    ) {
      continue;
    }

    let current: Grant | null = null;
    for (const row of rows) {
      const rt = norm(pick(row, ["recordtype"]));
      const gnRaw = String(
        pick(row, ["grantnumber", "grantid", "awardnumber"]),
      ).trim();

      if (hasRT && rt === "grant") {
        const grantedQty = num(
          pick(row, ["grantedqty", "grantedquantity", "sharesgranted"]),
        );
        // Sellable lots are also labeled Grant. They carry one lot's
        // "Shares Withheld", not the award. Only a row with Granted Qty. is the award.
        if (!(grantedQty > 0)) continue;
        const gn = gnRaw || `grant-${++order}`;
        current = ensure(gn);
        current.grantDate = iso(pick(row, ["grantdate"])) || current.grantDate;
        current.symbol = String(pick(row, ["symbol"]) || current.symbol);
        current.granted = Math.max(current.granted, grantedQty);
        const w = num(pick(row, ["withheldqty", "withheldquantity"]));
        if (w > current.withheldTotal) current.withheldTotal = w;
        continue;
      }

      const g: Grant = gnRaw ? ensure(gnRaw) : (current ?? ensure("Imported"));
      if (!current && gnRaw) current = g;

      if (!hasRT || rt.includes("vest")) {
        const vd = toDate(pick(row, ["vestdate", "releasedate"]));
        if (!vd) continue;
        const qty = Math.max(
          num(pick(row, ["vestedqty"])),
          num(pick(row, ["grantedqty"])),
          num(pick(row, ["unvestedqty"])),
          num(
            pick(
              row,
              ["vestqty", "sharesvesting", "quantity"],
              ["withheld", "released", "sellable", "blocked"],
            ),
          ),
        );
        if (!qty) continue;
        const traded = num(
          pick(row, ["sharestradedfortax", "sharessoldfortax"]),
        );
        const w = Math.max(
          traded,
          num(pick(row, ["withheldqty", "shareswithheld"])),
        );
        const fmv = num(pickExact(row, ["marketvalueatrelease"]));
        rememberVest(g, iso(vd), qty, w, fmv);
      } else if (rt.includes("tax") || rt.includes("event")) {
        const w = num(
          pick(row, [
            "withheldqty",
            "shareswithheld",
            "sharestraded",
            "sharessold",
          ]),
        );
        const d = toDate(
          pick(row, ["vestdate", "releasedate", "eventdate", "date"]),
        );
        if (w > 0 && d) {
          const v = g.vests.find((x) => x.date === iso(d));
          if (v) {
            v.withheld = w;
            v.src = "import";
          }
        }
      }
    }
  }

  const t = today0();
  const out = Object.values(grants).filter((g) => g.vests.length || g.granted);
  for (const g of out) {
    g.vests.sort((a, b) => a.date.localeCompare(b.date));
    if (!g.granted) {
      g.granted = g.vests.reduce((s, v) => s + v.qty, 0);
    }
    const known = g.vests
      .filter((v) => v.withheld != null)
      .reduce((s, v) => s + (v.withheld ?? 0), 0);
    const open = g.vests.filter((v) => {
      const d = toDate(v.date);
      return d != null && d <= t && v.withheld == null;
    });
    const remaining = Math.max(0, g.withheldTotal - known);
    const openQty = open.reduce((s, v) => s + v.qty, 0);
    if (remaining > 0 && openQty > 0) {
      let left = remaining;
      open.forEach((v, i) => {
        const share =
          i === open.length - 1 ? left : Math.round((remaining * v.qty) / openQty);
        v.withheld = share;
        v.src = "allocated";
        left -= share;
      });
    }
  }
  return out;
}
