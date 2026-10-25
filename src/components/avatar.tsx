import type { AvatarId } from "@/lib/avatars";

type PlanetStyle = { label: string; surface: string; glow: string; ring?: string };

export const AVATAR_STYLES: Record<AvatarId, PlanetStyle> = {
  nova: { label: "Nova", surface: "radial-gradient(circle at 30% 30%, #ffb3dc, #ff3ea5 45%, #6b0f45 85%)", glow: "#ff3ea5" },
  comet: { label: "Comet", surface: "radial-gradient(circle at 30% 30%, #e6feff, #3ef0ff 45%, #0d5560 85%)", glow: "#3ef0ff" },
  ringed: { label: "Ringed", surface: "radial-gradient(circle at 30% 30%, #c9b8ff, #7b3eff 45%, #2a1063 85%)", glow: "#7b3eff", ring: "#ffcf3e" },
  moon: { label: "Moon", surface: "radial-gradient(circle at 70% 65%, #8d8aa3 8%, transparent 9%), radial-gradient(circle at 35% 55%, #8d8aa3 6%, transparent 7%), radial-gradient(circle at 30% 30%, #ffffff, #c4c0d8 45%, #4a4760 85%)", glow: "#c4c0d8" },
  ember: { label: "Ember", surface: "radial-gradient(circle at 30% 30%, #ffe6a3, #ff7a2e 45%, #6b1d05 85%)", glow: "#ff7a2e" },
  verdant: { label: "Verdant", surface: "radial-gradient(circle at 30% 30%, #d4ffc9, #3edc6a 45%, #0d4a22 85%)", glow: "#3edc6a", ring: "#3ef0ff" },
};

/** A little planet used as the player's avatar. Decorative: pair it with the username. */
export function Avatar({ avatar, size = 40 }: { avatar: AvatarId; size?: number }) {
  const style = AVATAR_STYLES[avatar];
  return (
    <span
      aria-hidden
      className="relative inline-block shrink-0 rounded-full border-2 border-ink"
      style={{
        width: size,
        height: size,
        background: style.surface,
        boxShadow: `0 0 ${size / 4}px ${style.glow}88, 2px 2px 0 var(--color-ink)`,
      }}
    >
      {style.ring && (
        <span
          className="absolute rounded-[50%]"
          style={{
            inset: "38% -22%",
            border: `${Math.max(2, size / 16)}px solid ${style.ring}`,
            transform: "rotate(-18deg)",
          }}
        />
      )}
    </span>
  );
}
