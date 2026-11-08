import Link from "next/link";
import { logOut } from "@/app/(auth)/actions";
import { Avatar } from "@/components/avatar";
import { getCurrentPlayer } from "@/lib/auth";
import { PROJECTS } from "@/lib/projects";

/**
 * The site-wide header controls: a link to each project, and the account shared
 * by all of them. Anything project-specific (like the chip balance) lives in
 * that project's own menu.
 */
export async function HeaderAccount() {
  const player = await getCurrentPlayer();
  const projects = PROJECTS.filter((p) => p.status === "live").map((p) => (
    <Link key={p.key} href={p.path} className={`font-display text-[0.65rem] hover:text-starlight ${p.text}`}>
      {p.name}
    </Link>
  ));

  if (!player) {
    return (
      <nav className="flex items-center gap-2 sm:gap-3">
        {projects}
        <Link href="/login" className="font-display text-xs text-starlight hover:text-neon-cyan">
          Log in
        </Link>
        <Link href="/signup" className="pixel-btn bg-neon-magenta text-ink">
          Sign up
        </Link>
      </nav>
    );
  }

  return (
    <nav className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
      {projects}
      {player.isAdmin && (
        <Link href="/admin" className="font-display text-[0.65rem] text-neon-gold hover:text-starlight">
          Admin
        </Link>
      )}
      <Link
        href="/account"
        className="flex items-center gap-2 rounded-md px-1 hover:bg-space-800"
        aria-label={`${player.username}'s account`}
      >
        <Avatar avatar={player.avatar} size={28} />
        <span className="hidden max-w-32 truncate sm:inline">{player.username}</span>
      </Link>
      {/* On phones, log out lives on the account page to keep the header narrow. */}
      <form action={logOut} className="hidden sm:block">
        <button type="submit" className="font-display text-[0.65rem] text-starlight/70 hover:text-neon-magenta">
          Log out
        </button>
      </form>
    </nav>
  );
}
