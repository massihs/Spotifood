import { Link } from "@/i18n/navigation";
import { Logo } from "@/components/ui/logo";
import { LanguageSwitcher } from "@/components/language-switcher";

export default function AuthLayout({ children }: LayoutProps<"/[locale]">) {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-gradient-to-b from-accent-soft/70 to-bg px-5">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -end-32 -top-32 size-96 rounded-full bg-accent/15 blur-3xl"
      />
      <header className="relative mx-auto flex w-full max-w-md items-center justify-between py-6">
        <Link href="/" aria-label="Spotifood">
          <Logo />
        </Link>
        <LanguageSwitcher />
      </header>
      <main className="relative mx-auto w-full max-w-md flex-1 pt-4 pb-16 sm:pt-10">
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-[var(--shadow-float)] sm:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
