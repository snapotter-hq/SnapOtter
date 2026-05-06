import type { Metadata } from "next";
import { Inter, Nunito } from "next/font/google";
import "@/styles/globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const nunito = Nunito({ subsets: ["latin"], variable: "--font-nunito" });

export const metadata: Metadata = {
  title: "SnapOtter | Self-Hosted Image Processing",
  description:
    "48 image processing tools with local AI. Runs 100% offline. No data leaves your network. Open source and free forever.",
  metadataBase: new URL("https://snapotter.com"),
  openGraph: {
    title: "SnapOtter | Self-Hosted Image Processing",
    description:
      "48 image processing tools with local AI. Runs 100% offline. No data leaves your network.",
    url: "https://snapotter.com",
    siteName: "SnapOtter",
    type: "website",
    images: [
      {
        url: "/og-image.svg",
        width: 1200,
        height: 630,
        alt: "SnapOtter | Self-Hosted Image Processing",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "SnapOtter | Self-Hosted Image Processing",
    description:
      "48 image processing tools with local AI. Runs 100% offline. No data leaves your network.",
    images: ["/og-image.svg"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${nunito.variable}`} suppressHydrationWarning>
      <body
        className="bg-background text-foreground font-[family-name:var(--font-inter)] antialiased"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
