import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AppNav from "@/components/AppNav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

const description =
  "Photograph a clothing item and get a ready-to-post Depop listing: description, measurements, condition, tags, a price from matching Depop listings, and your take-home profit.";

export const metadata: Metadata = {
  title: "SnapList — @soldbychica",
  description,
  appleWebApp: { capable: true, title: "SnapList", statusBarStyle: "default" },
  // Link previews (iMessage, Slack, Discord): text card, no image.
  openGraph: { title: "SnapList", description, siteName: "SnapList", type: "website" },
  twitter: { card: "summary", title: "SnapList", description },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AppNav />
        {children}
      </body>
    </html>
  );
}
