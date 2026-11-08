import type { Metadata } from "next";
import { Press_Start_2P, Space_Grotesk } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { CrtOverlay, CrtToggle } from "@/components/crt";
import { DeepSpace } from "@/components/deep-space";
import { HeaderAccount } from "@/components/header-account";
import { SoundToggle } from "@/components/sound-toggle";
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
  description: "A small universe of games and projects among the stars.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${pixelFont.variable} ${bodyFont.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <a
          href="#main"
          className="sr-only z-[60] rounded-md bg-neon-cyan px-3 py-2 font-display text-xs text-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Skip to content
        </a>
        <div aria-hidden className="space-bg">
          <div className="nebula" />
          <DeepSpace />
          <div className="stars stars-far" />
          <div className="stars stars-mid" />
          <div className="stars stars-near" />
        </div>

        {/* Above the page, so the account menu opens over it. */}
        <header className="relative z-40 mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-2 px-4 py-3 sm:gap-x-8 sm:px-6 sm:py-4">
          <Link
            href="/"
            className="shrink-0 font-display text-sm text-neon-gold drop-shadow-[3px_3px_0_var(--color-ink)] sm:text-xl"
          >
            NAMRETEP
          </Link>
          {/* Reads the login cookie, so it streams in after the rest of the page. */}
          <Suspense fallback={<div className="h-11 flex-1" />}>
            <HeaderAccount />
          </Suspense>
        </header>

        <main id="main" tabIndex={-1} className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-12 outline-none sm:px-6">
          {children}
        </main>

        <footer className="flex flex-col items-center gap-4 px-4 py-6 text-center text-sm text-starlight/60">
          <Link href="/bugs" className="p-3 text-neon-cyan underline underline-offset-4 hover:text-starlight">
            Found a bug? Report it
          </Link>
          <div className="flex flex-wrap justify-center gap-3">
            <CrtToggle />
            <SoundToggle />
          </div>
        </footer>

        <CrtOverlay />
      </body>
    </html>
  );
}
