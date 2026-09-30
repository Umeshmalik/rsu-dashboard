import { describe, expect, it } from "vitest";

import {
  compute,
  fyOf,
  genSchedule,
  iso,
  mergeGrants,
  num,
  toDate,
  wholeSharesSold,
} from "~/lib/rsu";
import { defaultSettings, type Grant } from "~/lib/types";

describe("dates and numbers", () => {
  it("parses E*TRADE and written dates", () => {
    expect(iso(toDate("11/15/2024"))).toBe("2024-11-15");
    expect(iso("2024-11-15")).toBe("2024-11-15");
    expect(iso(toDate("15-NOV-2026"))).toBe("2026-11-15");
    expect(iso(toDate("Nov 15, 2026"))).toBe("2026-11-15");
    expect(toDate("")).toBeNull();
    expect(num("$1,250.50")).toBe(1250.5);
  });

  it("uses the Indian financial year", () => {
    expect(fyOf(new Date(2026, 3, 1))).toBe("FY 26-27");
    expect(fyOf(new Date(2026, 2, 31))).toBe("FY 25-26");
  });
});

describe("schedules", () => {
  it("puts the remainder on the last vest", () => {
    const vests = genSchedule({
      total: 10,
      first: "2024-11-15",
      every: 3,
      count: 3,
    });
    expect(vests.map((v) => v.date)).toEqual([
      "2024-11-15",
      "2025-02-15",
      "2025-05-15",
    ]);
    expect(vests.map((v) => v.qty)).toEqual([3, 3, 4]);
  });

  it("keeps tax shares typed in by hand across a re-import", () => {
    const previous: Grant = {
      id: "G-1",
      grantNumber: "G-1",
      grantDate: "2024-08-15",
      symbol: "EXPE",
      granted: 10,
      withheldTotal: 0,
      vests: [
        { date: "2024-11-15", qty: 10, withheld: 3, src: "edited" },
      ],
    };
    const incoming: Grant = {
      ...previous,
      vests: [{ date: "2024-11-15", qty: 10, withheld: null, src: "import" }],
    };
    const merged = mergeGrants([previous], [incoming]);
    expect(merged[0]?.vests[0]).toMatchObject({ withheld: 3, src: "edited" });
  });

  it("splits vested and unvested shares", () => {
    const grants: Grant[] = [
      {
        id: "G",
        grantNumber: "G",
        grantDate: "2020-01-01",
        symbol: "EXPE",
        granted: 10,
        withheldTotal: 0,
        vests: [
          { date: "2020-01-15", qty: 4, withheld: 1, src: "import" },
          { date: "2099-01-15", qty: 6, withheld: null, src: "import" },
        ],
      },
    ];
    const result = compute(grants, {
      ...defaultSettings(),
      taxRate: 50,
      useHistRate: true,
    });
    expect(result.histRate).toBeCloseTo(0.25);
    expect(result.T.vested).toBe(4);
    expect(result.T.pastNet).toBe(3);
    expect(result.T.unvested).toBe(6);
    expect(result.T.futTax).toBe(2);
    expect(result.T.futSalary).toBe(0);
    expect(result.next?.date).toBe("2099-01-15");
    expect(result.next?.net).toBe(4);
  });

  it("sells a whole share when tax is only a fraction, and pays the rest as salary", () => {
    expect(wholeSharesSold(3, 0.312)).toBe(1);
    expect(wholeSharesSold(4, 0.5)).toBe(2);
    const grants: Grant[] = [
      {
        id: "G",
        grantNumber: "G",
        grantDate: "2020-01-01",
        symbol: "EXPE",
        granted: 13,
        withheldTotal: 0,
        vests: [
          { date: "2020-06-15", qty: 10, withheld: 4, src: "import", fmv: 100 },
          { date: "2099-06-15", qty: 3, withheld: null, src: "import" },
        ],
      },
    ];
    const result = compute(grants, {
      ...defaultSettings(),
      taxRate: 31.2,
      useHistRate: false,
      price: 200,
    });
    const past = result.rows.find((r) => r.past);
    expect(past?.withheld).toBe(4);
    expect(past?.taxShares).toBeCloseTo(3.12);
    expect(past?.salaryShares).toBeCloseTo(0.88);
    expect(past?.net).toBe(6);
    expect(result.T.pastTaxUsd).toBeCloseTo(312);
    expect(result.T.pastSalaryUsd).toBeCloseTo(88);
    expect(result.T.granted).toBe(13);
    expect(result.T.pastNet + result.T.pastSold + result.T.unvested).toBe(13);

    const future = result.rows.find((r) => !r.past);
    expect(future?.withheld).toBe(1);
    expect(future?.taxShares).toBeCloseTo(0.936);
    expect(future?.salaryShares).toBeCloseTo(0.064);
    expect(future?.net).toBe(2);
  });
});
