import "~/styles/globals.css";

import { type Metadata } from "next";
import { Public_Sans } from "next/font/google";

import {
  SITE_AUTHOR,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TITLE,
  SITE_URL,
  jsonLdScript,
} from "~/lib/site";
import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: SITE_AUTHOR, url: SITE_URL }],
  creator: SITE_AUTHOR,
  publisher: SITE_AUTHOR,
  category: "finance",
  keywords: [
    "RSU calculator",
    "E*TRADE RSU",
    "restricted stock unit calculator",
    "RSU vest schedule",
    "RSU USD INR",
    "E*TRADE stock plan holdings",
  ],
  alternates: {
    canonical: SITE_URL,
    types: {
      "text/plain": `${SITE_URL}/llms.txt`,
    },
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    locale: "en_US",
    images: [
      {
        url: `${SITE_URL}/opengraph-image`,
        width: 1200,
        height: 630,
        alt: "RSU calculator for E*TRADE grants in shares, USD, and INR",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [`${SITE_URL}/opengraph-image`],
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
};

const publicSans = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-public-sans",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={publicSans.variable}>
      <body className="min-h-screen bg-paper font-sans text-ink antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript() }}
        />
        <TRPCReactProvider>{children}</TRPCReactProvider>
      </body>
    </html>
  );
}
