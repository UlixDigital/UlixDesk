import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { StagingBanner } from "@/components/staging-banner";
import { TimezoneSync } from "@/components/timezone-sync";
import "./globals.css";

const geistSans = Geist({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "UlixDesk",
    template: "%s · UlixDesk",
  },
  description: "Internal time tracking for UlixDesk.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.className} antialiased`}>
        <StagingBanner />
        <TimezoneSync />
        {children}
      </body>
    </html>
  );
}
