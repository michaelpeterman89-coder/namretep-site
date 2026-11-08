import Link from "next/link";

/**
 * The panel under the site header that holds a project's own menu: its name,
 * then whatever that project needs (see ProjectNav for the links). Pass
 * `heading` when the project's pages don't have their own h1.
 */
export function ProjectBar({
  name,
  href,
  color,
  heading = false,
  children,
}: {
  name: string;
  href: string;
  /** Text color class for the name (literal so Tailwind sees it). */
  color: string;
  heading?: boolean;
  children: React.ReactNode;
}) {
  const label = (
    <Link href={href} className={`font-display text-xs hover:text-starlight ${color}`}>
      {name}
    </Link>
  );
  return (
    <div className="pixel-panel flex flex-wrap items-center gap-x-4 gap-y-1 px-2.5 py-1.5 md:gap-x-6 md:px-4">
      {heading ? <h1 className="py-1.5 leading-none md:py-0">{label}</h1> : label}
      {children}
    </div>
  );
}
