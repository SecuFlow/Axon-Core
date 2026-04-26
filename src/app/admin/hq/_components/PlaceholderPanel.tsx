import type { ReactNode } from "react";

export function PlaceholderPanel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-[#1f1f1f] bg-[#0c0c0c]">
      <div className="flex items-center justify-between border-b border-[#1f1f1f] px-4 py-2.5">
        <h2 className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-[#7a7a7a]">
          {title}
        </h2>
        <div className="h-px w-8 bg-[#c9a962]/30" aria-hidden />
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}
