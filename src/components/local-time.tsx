"use client";

/**
 * Formats a time in the viewer's own timezone. The server renders it in UTC
 * first, so the text may change once the browser takes over.
 */
export function LocalTime({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
    </time>
  );
}
