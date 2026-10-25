import Link from "next/link";
import { logOut } from "@/app/(auth)/actions";
import { Avatar } from "@/components/avatar";
import { getCurrentPlayer } from "@/lib/auth";
import { formatChips } from "@/lib/chips";

/** Header controls: chip balance + profile link when logged in, otherwise auth links. */
export async function HeaderAccount() {
  const player = await getCurrentPlayer();

  if (!player) {
    return (
      <nav className="flex items-center gap-3">
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
    <nav className="flex items-center gap-3">
      <Link
        href="/profile"
        className="flex items-center gap-2 rounded-md px-1 hover:bg-space-800"
        aria-label={`${player.username}'s profile, ${formatChips(player.chips)} chips`}
      >
        <Avatar avatar={player.avatar} size={28} />
        <span className="hidden max-w-32 truncate sm:inline">{player.username}</span>
        <span className="font-display text-xs text-neon-gold">{formatChips(player.chips)}</span>
      </Link>
      <form action={logOut}>
        <button type="submit" className="font-display text-[0.65rem] text-starlight/70 hover:text-neon-magenta">
          Log out
        </button>
      </form>
    </nav>
  );
}
