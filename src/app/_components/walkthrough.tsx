"use client";

import { useEffect, useId, useRef, useState } from "react";

const focus =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";

export interface WalkthroughProps {
  open: boolean;
  watchDir: string;
  watching: boolean;
  onClose: () => void;
  onImport: () => void;
}

const STEPS = [
  {
    title: "Open Holdings in E*TRADE",
    body: "The expanded holdings sheet is the file this app reads. A summary download does not include the vest schedule or the shares sold for tax.",
    points: [
      "Sign in to E*TRADE and open Stock Plan.",
      "Go to My Account, then Holdings.",
      "Stay on the holdings page that lists each grant.",
    ],
  },
  {
    title: "Download the expanded sheet",
    body: "Use the download control on that Holdings page, and choose the expanded workbook.",
    points: [
      "Click the download icon.",
      "Choose Download expanded.",
      "The file is an .xlsx, often named ByStatus or ByBenefitType.",
    ],
  },
  {
    title: "Give the file to this app",
    body: "Either save it where the app is already watching, or pick it with Import file.",
    points: [],
  },
  {
    title: "Read the ledger",
    body: "After the import, the top of the page is the whole grant, split three ways.",
    points: [
      "In your account: shares that stayed after tax.",
      "Sold for tax: whole shares E*TRADE sold. Tax is taken out, and the leftover cash is paid in salary.",
      "Still to vest: what is left, with an estimate of the next sale.",
      "Download a fresh sheet after a new vest or a new grant. The price and USD/INR refresh on their own.",
    ],
  },
] as const;

export function Walkthrough({
  open,
  watchDir,
  watching,
  onClose,
  onImport,
}: WalkthroughProps) {
  const [step, setStep] = useState(0);
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const current = STEPS[step] ?? STEPS[0];
  const last = step === STEPS.length - 1;

  useEffect(() => {
    if (!open) return;
    setStep(0);
    dialogRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !current) return null;

  const savePoints =
    step === 2
      ? watching
        ? [
            `Save the .xlsx into ${watchDir}. It imports on its own.`,
            "Or click Import file and choose the workbook yourself.",
            "Leave the file name as E*TRADE saved it.",
          ]
        : [
            "Click Import file and choose the .xlsx.",
            "Folder watching is off on this machine, so a download alone will not import.",
          ]
      : current.points;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1f2a33]/40 p-4 sm:items-center">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="w-full max-w-lg rounded-xl border border-rule bg-card p-6 shadow-lg outline-none"
      >
        <p className="m-0 text-[13px] font-semibold text-mute">
          Step {step + 1} of {STEPS.length}
        </p>
        <h2 id={titleId} className="m-0 mt-1 text-2xl font-extrabold tracking-tight">
          {current.title}
        </h2>
        <p className="m-0 mt-2 leading-normal text-mute">{current.body}</p>
        <ol className="my-4 list-decimal space-y-2 pl-5 leading-normal">
          {savePoints.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ol>
        <div className="mb-5 flex gap-1.5" aria-hidden>
          {STEPS.map((item, index) => (
            <span
              key={item.title}
              className={`h-1.5 flex-1 rounded-full ${index <= step ? "bg-ink" : "bg-rule"}`}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" className={`text-sm font-semibold text-mute ${focus}`} onClick={onClose}>
            Skip
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button
                type="button"
                className={`rounded-md border border-rule px-3.5 py-2 text-sm font-semibold ${focus}`}
                onClick={() => setStep((n) => n - 1)}
              >
                Back
              </button>
            )}
            {last ? (
              <button
                type="button"
                className={`rounded-md border border-ink bg-ink px-3.5 py-2 text-sm font-semibold text-white ${focus}`}
                onClick={() => {
                  onImport();
                  onClose();
                }}
              >
                Import the file
              </button>
            ) : (
              <button
                type="button"
                className={`rounded-md border border-ink bg-ink px-3.5 py-2 text-sm font-semibold text-white ${focus}`}
                onClick={() => setStep((n) => n + 1)}
              >
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
