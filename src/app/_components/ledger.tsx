"use client";

import dynamic from "next/dynamic";

const Dashboard = dynamic(
  () => import("~/app/_components/dashboard").then((mod) => mod.Dashboard),
  {
    ssr: false,
    loading: () => (
      <main className="mx-auto max-w-270 px-5 pt-7 pb-10">
        <div className="text-lg font-extrabold tracking-tight">RSU ledger</div>
      </main>
    ),
  },
);

export function Ledger() {
  return <Dashboard />;
}
