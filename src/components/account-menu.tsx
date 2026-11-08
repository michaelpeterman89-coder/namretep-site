"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { logOut } from "@/app/(auth)/actions";
import { Avatar } from "@/components/avatar";
import type { AvatarId } from "@/lib/avatars";

const ITEM = "block w-full px-4 py-3.5 text-left font-display text-[0.65rem] leading-normal hover:bg-space-800";

/** The site header's account button: opens a menu with Account, Admin, and Log out. */
export function AccountMenu({ username, avatar, isAdmin }: { username: string; avatar: AvatarId; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={root}
      className="relative shrink-0"
      onBlur={(e) => {
        // Tabbing out closes it. relatedTarget is empty when clicking something unfocusable.
        if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls="account-menu"
        aria-label={`${username}'s account`}
        onClick={() => setOpen(!open)}
        className="flex min-h-11 items-center gap-2 rounded-md border-2 border-space-700 bg-space-800 px-1.5 hover:border-neon-cyan sm:px-2.5"
      >
        <Avatar avatar={avatar} size={28} />
        <span className="hidden max-w-32 truncate sm:inline">{username}</span>
        <svg
          aria-hidden
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`hidden sm:block ${open ? "rotate-180" : ""}`}
        >
          <path d="M2 4l4 4 4-4" />
        </svg>
      </button>

      {open && (
        <div id="account-menu" className="pixel-panel absolute top-full right-0 mt-2 w-52 bg-space-900! py-1.5">
          {/* The button only shows the name on bigger screens. */}
          <p className="truncate px-4 pt-2 pb-1 sm:hidden">{username}</p>
          <Link href="/account" onClick={() => setOpen(false)} className={`${ITEM} text-starlight`}>
            Account
          </Link>
          {isAdmin && (
            <Link href="/admin" onClick={() => setOpen(false)} className={`${ITEM} text-neon-gold`}>
              Admin
            </Link>
          )}
          <div className="mx-3 my-1 h-0.5 bg-space-700" />
          <form action={logOut}>
            <button type="submit" className={`${ITEM} text-starlight/70`}>
              Log out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
