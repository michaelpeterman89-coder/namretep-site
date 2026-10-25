import type { Metadata } from "next";
import { Press_Start_2P, Space_Grotesk } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { CrtOverlay, CrtToggle } from "@/components/crt";
import { HeaderAccount } from "@/components/header-account";
import "./globals.css";

const pixelFont = Press_Start_2P({
  variable: "--font-pixel",
  weight: "400",
  subsets: ["latin"],
});

const bodyFont = Space_Grotesk({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Namretep",
  description: "Configurable casino games among the stars. Virtual chips only.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${pixelFont.variable} ${bodyFont.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <div aria-hidden className="space-bg">
          <div className="nebula" />
          <div className="stars stars-far" />
          <div className="stars stars-mid" />
          <div className="stars stars-near" />
          <div className="planet" />
        </div>

        <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
          <Link
            href="/"
            className="font-display text-sm text-neon-gold drop-shadow-[3px_3px_0_var(--color-ink)] sm:text-xl"
          >
            NAMRETEP
          </Link>
          {/* Reads the login cookie, so it streams in after the rest of the page. */}
          <Suspense fallback={<div className="h-10 w-32" />}>
            <HeaderAccount />
          </Suspense>
        </header>

        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-12 sm:px-6">
          {children}
        </main>

        <footer className="flex flex-col items-center gap-4 px-4 py-6 text-center text-sm text-starlight/60">
          <p>Virtual chips only. No real money, no purchases, no cash-out.</p>
          <CrtToggle />
        </footer>

        <CrtOverlay />
      </body>
    </html>
  );
}
