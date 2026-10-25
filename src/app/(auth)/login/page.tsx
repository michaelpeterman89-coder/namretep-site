import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in · Namretep" };

export default function LoginPage() {
  return (
    <div className="mx-auto w-full max-w-md pt-6 sm:pt-12">
      <div className="pixel-panel flex flex-col gap-6 p-6 sm:p-8">
        <h1 className="font-display text-base text-neon-gold">Log in</h1>
        {/* LoginForm reads ?next= from the URL, which isn't known at build time. */}
        <Suspense fallback={<div className="h-64" />}>
          <LoginForm />
        </Suspense>
        <p className="text-sm text-starlight/70">
          New here?{" "}
          <Link href="/signup" className="text-neon-cyan underline underline-offset-4">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
