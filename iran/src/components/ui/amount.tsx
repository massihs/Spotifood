import { cn } from "@/lib/cn";

/**
 * An amount with its unit set apart: "۴۵۰,۰۰۰" in full, "تومان" small and quiet beside it, so the
 * figure reads first and the pair never breaks over two lines. Text without a trailing word unit
 * (a count, "12,00 €") is shown as it is.
 */
export function Amount({ text, className }: { text: string; className?: string }) {
  const m = /^(.*\p{Nd})\s+([^\p{Nd}\s]+)$/u.exec(text.trim());
  return (
    <span className={cn("inline-flex items-baseline gap-1 whitespace-nowrap tabular-nums", className)}>
      {m ? (
        <>
          {m[1]}
          <span className="text-[0.68em] font-semibold opacity-70">{m[2]}</span>
        </>
      ) : (
        text
      )}
    </span>
  );
}
