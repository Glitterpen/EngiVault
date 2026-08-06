import Link from "next/link";

export function Brand({ href = "/", compact = false }: { href?: string; inverse?: boolean; compact?: boolean }) {
  return (
    <Link href={href} className={`relative block overflow-hidden ${compact ? "h-14 w-44" : "h-16 w-52"}`} aria-label="EngiCite home">
      <img
        src="/engicite-logo.png"
        alt="EngiCite"
        className={`absolute left-1/2 top-1/2 max-w-none -translate-x-1/2 -translate-y-1/2 ${compact ? "w-[190px]" : "w-[220px]"}`}
      />
    </Link>
  );
}
