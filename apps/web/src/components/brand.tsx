import Link from "next/link";
import Image from "next/image";

export function Brand({ href = "/", inverse = false, compact = false }: { href?: string; inverse?: boolean; compact?: boolean }) {
  return (
    <Link href={href} className={`relative block shrink-0 overflow-hidden ${compact ? "h-12 w-44" : "h-14 w-52"}`} aria-label="EngiCite home">
      <span className="absolute inset-0">
        <Image
          src={inverse ? "/engicite-logo-inverse.png" : "/engicite-logo-transparent.png"}
          alt="EngiCite"
          width={1280}
          height={605}
          priority={compact}
          unoptimized
          className={`absolute h-auto max-w-none ${compact ? "-left-[21px] -top-[25px] w-[210px]" : "-left-[25px] -top-[30px] w-[248px]"}`}
        />
      </span>
    </Link>
  );
}
