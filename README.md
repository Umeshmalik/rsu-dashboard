# RSU ledger

A local-only dashboard for your E*TRADE RSUs. It shows vested, unvested, withheld for tax, and received shares, plus every future vest, in units, USD, and INR.

The app is a [T3](https://create.t3.gg) stack: Next.js, tRPC, Tailwind CSS, and TypeScript, installed with pnpm. Grants stay in `data/db.json` on this machine. Nothing leaves the machine except a price lookup for your ticker and the live USD/INR spot, the same interbank quote E*TRADE uses. Yahoo Finance is tried first; Nasdaq and CNBC are the share-price fallbacks. For the rupee rate, Yahoo is tried first, then the CNBC USD/INR spot, then Frankfurter and Stooq. The server listens only on `127.0.0.1`.

## Run it

Requires Node 18.18 or newer, and pnpm 9.

```bash
cd rsu-dashboard
pnpm install
pnpm dev           # http://127.0.0.1:4280
```

For a production build:

```bash
pnpm build
pnpm start         # http://127.0.0.1:4280
```

`pnpm test` checks the ledger math and every API. `pnpm typecheck` runs the TypeScript compiler.

## API

The UI calls these tRPC procedures on `POST /api/trpc`:

| Procedure | Kind | Purpose |
|---|---|---|
| `rsu.state` | query | Grants, price settings, and import status |
| `rsu.save` | mutation | Replace grants and settings |
| `rsu.importFile` | mutation | Import an E*TRADE workbook sent as base64 |
| `rsu.quote` | mutation | Refresh the share price and USD/INR |

`GET /api/events` is a server-sent event stream. Open tabs hear about a watched-folder import or a new quote and refresh on their own.

## Getting your data in

The first time you open the dashboard, a short guide walks through the same steps. You can open it again with **Guide**.

1. In E*TRADE, go to Stock Plan → My Account → Holdings.
2. Click the download icon and choose **Download expanded**. The file is named something like `ByStatus Expanded Stock Plan.xlsx`.
3. Save it to `~/Downloads`. The server spots it and imports it within a couple of seconds, and any open dashboard tab refreshes on its own.

You can also use the **Import file** button in the dashboard.

If an import finds nothing, the dashboard lists the column headers it saw. Share those headers (no values) and the parser in `src/server/parse.ts` can be adjusted.

## What stays in sync without you doing anything

| Thing | How |
|---|---|
| Share price and USD/INR | Fetched on page load and every 15 minutes while the server runs |
| Vested vs unvested | Recomputed from vest dates, so shares move to vested on the vest date without a re-import |
| New exports | Any `ByBenefitType*`, `ByStatus*`, or `BenefitHistory*` file saved in the watched folder is imported |
| Your edits | Saved to `data/db.json`, with a daily copy in `data/backups/` |

Re-download from E*TRADE when you get a new grant, or when you want its actual withheld-share numbers to replace the estimates. Tax shares you typed in by hand are kept across re-imports unless the new file has a real per-vest number.

## Configuration

Set these as environment variables before running. The schema lives in `src/env.js`. See `.env.example`.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4280` | Server port. The npm scripts pin `4280`; override by editing them if you need another port. |
| `RSU_WATCH_DIR` | `~/Downloads` | Folder watched for E*TRADE exports |
| `RSU_DATA_DIR` | `./data` | Where `db.json` and backups live |

Example: `RSU_WATCH_DIR=~/Documents/etrade pnpm dev`

## Start at login (macOS, optional)

Run `pnpm build` once. Then save the following as `~/Library/LaunchAgents/com.umesh.rsu-ledger.plist`, replacing the paths with your own. Use `which node` to find the node path, and point the script at this project's `node_modules/next/dist/bin/next`.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.umesh.rsu-ledger</string>
  <key>ProgramArguments</key>
  <array>
    <string>/opt/homebrew/bin/node</string>
    <string>/Users/YOU/rsu-dashboard/node_modules/next/dist/bin/next</string>
    <string>start</string>
    <string>--hostname</string>
    <string>127.0.0.1</string>
    <string>--port</string>
    <string>4280</string>
  </array>
  <key>WorkingDirectory</key><string>/Users/YOU/rsu-dashboard</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/rsu-ledger.log</string>
  <key>StandardErrorPath</key><string>/tmp/rsu-ledger.log</string>
</dict>
</plist>
```

Load it with `launchctl load ~/Library/LaunchAgents/com.umesh.rsu-ledger.plist`, then bookmark http://127.0.0.1:4280.

## Troubleshooting

- **Nothing is auto-imported from Downloads.** macOS asks your terminal (or node, when run under launchd) for permission to read Downloads. Allow it in System Settings → Privacy & Security → Files and Folders. If your managed Mac blocks this, point `RSU_WATCH_DIR` at another folder and save the E*TRADE export there.
- **Price fetch fails on the corporate network or VPN.** A TLS-inspecting proxy such as Zscaler can break Node's HTTPS requests. Export your corporate root certificate and run with `NODE_EXTRA_CA_CERTS=/path/to/corp-root.pem pnpm dev`. You can always type the price and rate under Assumptions instead.
- **Tax numbers look off.** Past vests show estimates (marked with `~`) until you enter actual tax shares from each release confirmation, or until E*TRADE's export includes them. Future tax uses your actual rate so far, or the rate you set.

## Caveats

- All values use today's price. Indian tax on RSUs is assessed on the FMV on each vest date, so use Form 16 and your release confirmations for filing.
- The `xlsx` dependency is installed from SheetJS's official CDN, because the copy on the npm registry is outdated and has known vulnerabilities.
