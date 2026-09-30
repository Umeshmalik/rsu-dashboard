export const SITE_URL = "https://rsu-calculator.umesh-malik.com";

export const SITE_NAME = "RSU calculator";
export const SITE_TITLE =
  "RSU calculator for E*TRADE grants in USD and INR";
export const SITE_DESCRIPTION =
  "Free, open-source E*TRADE RSU calculator. Vested, unvested, tax, and future vests in units, USD, and INR. Your file stays in the browser.";

export const SITE_AUTHOR = "Umesh Malik";
export const SOURCE_URL = "https://github.com/Umeshmalik/rsu-dashboard";
export const LICENSE_NAME = "MIT";
export const LICENSE_URL = "https://opensource.org/licenses/MIT";

export interface TrustFact {
  label: string;
  text: string;
  href?: string;
  linkLabel?: string;
}

export const TRUST: readonly TrustFact[] = [
  {
    label: "Free",
    text: "There is no fee, account, or subscription.",
  },
  {
    label: "Open source",
    text: "The program is MIT licensed. You can read the calculation code, run it yourself, and keep a copy.",
    href: SOURCE_URL,
    linkLabel: "Source on GitHub",
  },
  {
    label: "Your file stays here",
    text: "The E*TRADE workbook is parsed in this browser. Grants, vest dates, and edits are stored in this browser and are not uploaded.",
  },
  {
    label: "What is sent",
    text: "A price refresh sends the ticker symbol only. It does not include grant sizes, vest dates, or tax shares.",
  },
  {
    label: "No tracking",
    text: "This site does not use an analytics account, advertising, or a login.",
  },
  {
    label: "Price sources",
    text: "Share prices come from Yahoo Finance, then Nasdaq, CNBC, and Stooq. USD/INR is a live interbank spot from Yahoo Finance, then CNBC, Frankfurter, and Stooq. It is not the State Bank of India rate used on a tax return.",
  },
  {
    label: "Not advice",
    text: "Amounts use today's price. Indian tax on RSUs uses the fair market value on each vest date. Use Form 16 and your release confirmations for filing. This is not tax, legal, or investment advice.",
  },
  {
    label: "You can leave",
    text: "Download a JSON backup of the ledger at any time and restore it later. Nothing about your grants is kept on the server.",
  },
];

export interface Faq {
  question: string;
  answer: string;
}

export const FAQS: readonly Faq[] = [
  {
    question: "What is this RSU calculator?",
    answer:
      "RSU calculator is a private ledger for restricted stock units from an E*TRADE stock plan. It turns the expanded holdings workbook into vested, unvested, tax-withheld, and received shares, and lists every future vest in share units, US dollars, and Indian rupees.",
  },
  {
    question: "Does the calculator upload my E*TRADE spreadsheet?",
    answer:
      "No. The workbook is read in your browser and is not uploaded. Grants, vest dates, and tax-share edits stay in this browser. The only network requests are a share-price lookup and a USD/INR rate.",
  },
  {
    question: "Which E*TRADE file should I import?",
    answer:
      "In E*TRADE, open Stock Plan, then My Account, then Holdings. Use the download icon and choose Download expanded. The file is an .xlsx, often named ByStatus or ByBenefitType. A summary download does not include the vest schedule or the shares sold for tax.",
  },
  {
    question: "What does the ledger show?",
    answer:
      "It splits each grant into shares already in your account, shares sold for tax, cash paid through salary from a partial share, and shares still to vest. Vested and unvested amounts are recomputed from the vest dates, so shares move to vested on the vest date without a new import.",
  },
  {
    question: "How are dollar and rupee amounts calculated?",
    answer:
      "Dollar amounts use the latest share price times the number of shares. Rupee amounts multiply that dollar value by a live USD/INR spot rate. Figures use today's price. Indian tax on RSUs is assessed on the fair market value on each vest date, so Form 16 and release confirmations are the numbers to use for filing.",
  },
  {
    question: "Where do the share price and the USD/INR rate come from?",
    answer:
      "The share price is taken from Yahoo Finance, then Nasdaq, CNBC, and Stooq if an earlier source fails. The USD/INR rate is the live spot from Yahoo Finance, then the CNBC spot, Frankfurter, and Stooq. It is an interbank spot, not the State Bank of India rate used on an Indian tax return.",
  },
  {
    question: "Can I open the calculator offline?",
    answer:
      "After one online visit, a production load is cached in the browser, so the ledger opens later without a connection. The last share price and USD/INR rate stay in use until the next successful refresh.",
  },
  {
    question: "Is the RSU calculator free?",
    answer: "Yes. There is no fee, account, or subscription.",
  },
  {
    question: "Is the source code public?",
    answer:
      "Yes. RSU calculator is MIT-licensed open source at https://github.com/Umeshmalik/rsu-dashboard. You can read the calculation code, run it yourself, and keep a copy.",
  },
  {
    question: "Is this tax or investment advice?",
    answer:
      "No. Amounts use today's price. Indian tax on RSUs uses the fair market value on each vest date. Use Form 16 and your release confirmations for filing. This is not tax, legal, or investment advice.",
  },
  {
    question: "Who publishes this calculator?",
    answer:
      "Umesh Malik publishes RSU calculator at https://rsu-calculator.umesh-malik.com. The source is the MIT-licensed repository at https://github.com/Umeshmalik/rsu-dashboard.",
  },
];

export function absoluteUrl(path = "/"): string {
  const url = new URL(path, `${SITE_URL}/`);
  if (url.pathname === "/" && !url.search && !url.hash) return SITE_URL;
  return url.toString();
}

export function jsonLd(): Record<string, unknown> {
  const pageUrl = absoluteUrl("/");
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${pageUrl}#website`,
        url: pageUrl,
        name: SITE_NAME,
        description: SITE_DESCRIPTION,
        inLanguage: "en",
        publisher: { "@id": `${pageUrl}#publisher` },
      },
      {
        "@type": "WebPage",
        "@id": `${pageUrl}#webpage`,
        url: pageUrl,
        name: SITE_TITLE,
        description: SITE_DESCRIPTION,
        isPartOf: { "@id": `${pageUrl}#website` },
        about: { "@id": `${pageUrl}#app` },
        inLanguage: "en",
        primaryImageOfPage: absoluteUrl("/opengraph-image"),
      },
      {
        "@type": "Person",
        "@id": `${pageUrl}#publisher`,
        name: SITE_AUTHOR,
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${pageUrl}#app`,
        name: SITE_NAME,
        url: pageUrl,
        applicationCategory: "FinanceApplication",
        operatingSystem: "Web",
        description: SITE_DESCRIPTION,
        inLanguage: "en",
        isAccessibleForFree: true,
        license: LICENSE_URL,
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
          description: "Free. No account and no subscription.",
        },
        author: { "@id": `${pageUrl}#publisher` },
        featureList: [
          "Import an E*TRADE expanded holdings workbook in the browser",
          "Vested, unvested, tax-withheld, and received shares",
          "Future vest schedule",
          "Values in share units, US dollars, and Indian rupees",
          "Grants stored only on the device",
          "Free, with no account",
          "MIT-licensed source code",
        ],
      },
      {
        "@type": "SoftwareSourceCode",
        "@id": `${pageUrl}#source`,
        name: SITE_NAME,
        url: SOURCE_URL,
        codeRepository: SOURCE_URL,
        license: LICENSE_URL,
        programmingLanguage: {
          "@type": "ComputerLanguage",
          name: "TypeScript",
        },
        author: { "@id": `${pageUrl}#publisher` },
        targetProduct: { "@id": `${pageUrl}#app` },
      },
      {
        "@type": "FAQPage",
        "@id": `${pageUrl}#faq`,
        url: `${pageUrl}#faq`,
        isPartOf: { "@id": `${pageUrl}#webpage` },
        mainEntity: FAQS.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.answer,
          },
        })),
      },
    ],
  };
}

export function jsonLdScript(): string {
  return JSON.stringify(jsonLd()).replace(/</g, "\\u003c");
}

export function llmsText(): string {
  const facts = FAQS.map(
    (item) => `### ${item.question}\n\n${item.answer}`,
  ).join("\n\n");
  return `# ${SITE_NAME}

> ${SITE_DESCRIPTION}

Canonical URL: ${SITE_URL}

This file is a plain-language description for answer engines and other systems that cite the web. The same facts are on the page at ${SITE_URL}#faq.

## Publisher

${SITE_AUTHOR}

## What it calculates

An E*TRADE restricted stock unit grant: shares already received, shares sold to cover tax, cash paid through salary, shares still to vest, and the same quantities in USD and INR at the latest price and USD/INR spot.

## License

${LICENSE_NAME}: ${LICENSE_URL}

Source code: ${SOURCE_URL}

## Trust

${TRUST.map((item) => `- ${item.label}: ${item.text}`).join("\n")}

## Privacy

The holdings workbook is parsed locally. Grant data is not sent to the server and is not used to personalize this public description.

${facts}

## Machine-readable links

- Sitemap: ${absoluteUrl("/sitemap.xml")}
- Robots: ${absoluteUrl("/robots.txt")}
`;
}
