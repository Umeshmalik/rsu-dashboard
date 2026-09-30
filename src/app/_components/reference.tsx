import {
  FAQS,
  SITE_DESCRIPTION,
  SOURCE_URL,
  TRUST,
} from "~/lib/site";

const linkClass =
  "font-semibold text-ink underline decoration-rule underline-offset-2";

export function TrustStrip() {
  return (
    <div className="border-b border-rule bg-card">
      <ul className="mx-auto my-0 flex max-w-270 list-none flex-wrap gap-x-4 gap-y-1 px-5 py-2 text-sm text-mute">
        <li>Free</li>
        <li>
          <a className={linkClass} href={SOURCE_URL}>
            Open source, MIT
          </a>
        </li>
        <li>
          <a className={linkClass} href="#trust">
            Grants stay in this browser
          </a>
        </li>
        <li>No account or analytics</li>
      </ul>
    </div>
  );
}

export function Reference() {
  return (
    <footer className="mx-auto max-w-270 px-5 pt-2 pb-16">
      <section
        id="trust"
        aria-labelledby="trust-heading"
        className="rounded-lg border border-rule bg-card px-5 py-4"
      >
        <h2
          id="trust-heading"
          className="m-0 text-lg font-extrabold tracking-tight text-ink"
        >
          Why this calculator is safe to try
        </h2>
        <p className="m-0 mt-2 max-w-[75ch] text-sm leading-normal text-mute">
          It is free and MIT licensed. These are the checks that matter for a
          finance tool: where your grants go, what leaves the browser, and who
          publishes the code.
        </p>
        <dl className="m-0 mt-4 divide-y divide-rule border-t border-rule">
          {TRUST.map((item) => (
            <div
              key={item.label}
              className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr] sm:gap-4"
            >
              <dt className="text-sm font-semibold text-ink">{item.label}</dt>
              <dd className="m-0 max-w-[75ch] text-sm leading-normal text-mute">
                {item.text}
                {item.href && item.linkLabel ? (
                  <>
                    {" "}
                    <a className={linkClass} href={item.href}>
                      {item.linkLabel}
                    </a>
                    .
                  </>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <section
        id="faq"
        aria-labelledby="about-calculator"
        className="mt-4 rounded-lg border border-rule bg-card px-5 py-4"
      >
        <h2
          id="about-calculator"
          className="m-0 text-lg font-extrabold tracking-tight text-ink"
        >
          About this RSU calculator
        </h2>
        <p className="m-0 mt-2 max-w-[75ch] text-sm leading-normal text-mute">
          {SITE_DESCRIPTION} The in-app name is RSU ledger. Canonical address:{" "}
          <a className={linkClass} href="https://rsu-calculator.umesh-malik.com">
            rsu-calculator.umesh-malik.com
          </a>
          .
        </p>
        <div className="mt-4 divide-y divide-rule border-t border-rule">
          {FAQS.map((item) => (
            <article key={item.question} className="py-3">
              <h3 className="m-0 text-sm font-semibold text-ink">
                {item.question}
              </h3>
              <p className="m-0 mt-1 max-w-[75ch] text-sm leading-normal text-mute">
                {item.answer}
              </p>
            </article>
          ))}
        </div>
      </section>
    </footer>
  );
}
