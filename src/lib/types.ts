export type VestSrc = "import" | "allocated" | "manual" | "edited";

export interface Vest {
  date: string;
  qty: number;
  /** Whole shares sold to cover tax. Null until a release confirms the count. */
  withheld: number | null;
  src: VestSrc;
  /** Price per share on the release date, when the export includes it. */
  fmv?: number | null;
}

export interface Grant {
  id: string;
  grantNumber: string;
  grantDate: string;
  symbol: string;
  granted: number;
  withheldTotal: number;
  vests: Vest[];
}

export interface Settings {
  symbol: string;
  price: number | null;
  usdinr: number | null;
  asOf: string | null;
  fetchedAt: number | null;
  manualPrice: boolean;
  taxRate: number;
  useHistRate: boolean;
}

export interface LastImport {
  at: number;
  file: string;
  via: "watch" | "upload";
  grants: number;
  vests: number;
}

export interface Db {
  grants: Grant[];
  settings: Settings;
  meta: {
    processed: Record<string, number>;
    lastImport: LastImport | null;
  };
}

export interface PublicMeta {
  lastImport: LastImport | null;
  watchDir: string;
  watching: boolean;
  dataFile: string;
}

export function defaultSettings(): Settings {
  return {
    symbol: "EXPE",
    price: null,
    usdinr: null,
    asOf: null,
    fetchedAt: null,
    manualPrice: false,
    taxRate: 31.2,
    useHistRate: true,
  };
}
