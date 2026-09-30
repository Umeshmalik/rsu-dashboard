import { ImageResponse } from "next/og";

export const alt = "RSU calculator for E*TRADE grants in shares, USD, and INR";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#f3f5f2",
          color: "#1f2a33",
          padding: "72px",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: "-0.03em",
          }}
        >
          rsu-calculator.umesh-malik.com
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: 76,
              fontWeight: 800,
              letterSpacing: "-0.04em",
              lineHeight: 1,
            }}
          >
            RSU calculator
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 24,
              fontSize: 32,
              lineHeight: 1.35,
              color: "#5d6b74",
              maxWidth: 900,
            }}
          >
            E*TRADE vest ledger in shares, US dollars, and Indian rupees. The
            workbook stays in your browser.
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
