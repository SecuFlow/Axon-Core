import Link from "next/link";
import Image from "next/image";

type Variant = "home" | "simple";

export function PublicHeader(props: { variant: Variant }) {
  const navLink =
    "text-sm font-medium text-zinc-400 transition-colors hover:text-white";
  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#030304]/75 backdrop-blur-xl backdrop-saturate-150">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6 sm:h-[4.25rem] sm:px-8">
        <Link href="/" className="group flex items-center gap-3 sm:gap-3.5">
          <Image
            src="/axoncore-logo.png"
            alt="AxonCore"
            width={180}
            height={64}
            className="h-11 w-auto shrink-0 object-contain sm:h-12"
            priority
          />
        </Link>

        <div className="flex flex-wrap items-center justify-end gap-6 sm:gap-10">
          <Link href="/login" className={navLink}>
            {props.variant === "home" ? "Registrieren/Login" : "Login"}
          </Link>
        </div>
      </nav>
    </header>
  );
}

