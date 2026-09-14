import type { Metadata, Viewport } from "next";
import { Saira, Archivo, JetBrains_Mono } from "next/font/google";

import { SITE, siteUrl } from "@/lib/site";
import "@/styles/globals.css";

/* Design system families, self-hosted by next/font. The design system loads these
   from the Google CDN; self-hosting removes a render-blocking third-party request
   and the FOUT that comes with it. Families and weights are unchanged. */

const saira = Saira({
  subsets: ["latin"],
  variable: "--font-saira",
  display: "swap",
});

const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: {
    default: `${SITE.name} — ${SITE.tagline}`,
    template: `%s — ${SITE.name}`,
  },
  description: SITE.description,
  applicationName: SITE.name,
  openGraph: {
    type: "website",
    siteName: SITE.name,
    locale: SITE.locale,
    title: `${SITE.name} — ${SITE.tagline}`,
    description: SITE.description,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE.name} — ${SITE.tagline}`,
    description: SITE.description,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: "#050506",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en-IN"
      className={`${saira.variable} ${archivo.variable} ${jetbrainsMono.variable}`}
    >
      {/* Browser extensions stamp attributes onto <body> before hydration
          (e.g. data-demoway-document-id). This silences that one element's
          attribute diff only; mismatches in children are still reported. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
