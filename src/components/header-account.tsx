import Link from "next/link";
import { AccountMenu } from "@/components/account-menu";
import { ProjectLinks } from "@/components/project-links";
import { getCurrentPlayer } from "@/lib/auth";

/**
 * The site-wide header controls: a link to each project, and the account shared
 * by all of them. Anything project-specific (like the chip balance) lives in
 * that project's own menu.
 */
export async function HeaderAccount() {
  const player = await getCurrentPlayer();

  if (!player) {
    return (
      <>
        {/* On phones there's no room beside Log in and Sign up, so projects get their own row. */}
        <ProjectLinks className="order-last basis-full sm:order-none sm:flex-1 sm:basis-0" />
        <nav aria-label="Account" className="ml-auto flex items-center gap-2 sm:gap-4">
          <Link
            href="/login"
            className="flex min-h-11 items-center font-display text-[0.65rem] text-starlight hover:text-neon-cyan sm:text-xs"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="pixel-btn bg-neon-magenta px-2! py-3.5! text-[0.65rem]! text-ink sm:px-[1.1rem]! sm:py-[0.85rem]! sm:text-xs!"
          >
            Sign up
          </Link>
        </nav>
      </>
    );
  }

  return (
    <>
      <ProjectLinks className="flex-1 basis-0" />
      <AccountMenu username={player.username} avatar={player.avatar} isAdmin={player.isAdmin} />
    </>
  );
}
