import type { Metadata } from "next";
import Link from "next/link";
import { STARTING_CHIPS, formatChips } from "@/lib/chips";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Sign up · Namretep" };

export default function SignupPage() {
  return (
    <div className="mx-auto w-full max-w-md pt-6 sm:pt-12">
      <div className="pixel-panel flex flex-col gap-6 p-6 sm:p-8">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-base text-neon-gold">Sign up</h1>
          <p className="text-starlight/80">
            New players start with {formatChips(STARTING_CHIPS)} virtual chips.
          </p>
        </div>
        <SignupForm />
        <p className="text-sm text-starlight/70">
          Already have an account?{" "}
          <Link href="/login" className="text-neon-cyan underline underline-offset-4">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
