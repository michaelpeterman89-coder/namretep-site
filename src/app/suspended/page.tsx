import type { Metadata } from "next";
import { logOut } from "@/app/(auth)/actions";

export const metadata: Metadata = { title: "Account suspended · Namretep" };

export default function SuspendedPage() {
  return (
    <div className="pixel-panel mx-auto mt-12 flex max-w-md flex-col items-center gap-4 p-8 text-center">
      <h1 className="font-display text-base text-neon-magenta">Account suspended</h1>
      <p className="text-starlight/80">
        An admin has suspended this account, so it can&apos;t play right now. If you think this is a mistake, contact the
        site owner.
      </p>
      <form action={logOut}>
        <button type="submit" className="pixel-btn bg-space-800 text-starlight">
          Log out
        </button>
      </form>
    </div>
  );
}
