import { getTranslations } from "next-intl/server";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Logo } from "@/components/ui/logo";
import { Link } from "@/i18n/navigation";

export async function SiteFooter() {
  const t = await getTranslations("landing");
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-fg-muted sm:px-6">
        <Logo />
        <p>{t("footer.rights")}</p>
        <nav className="flex flex-wrap items-center gap-4">
          <Link href="/restaurants" className="hover:text-fg">
            {t("nav.restaurants")}
          </Link>
          <Link href="/#contact" className="hover:text-fg">
            {t("nav.contact")}
          </Link>
          <Link href="/login" className="hover:text-fg">
            {t("footer.login")}
          </Link>
          <Link href="/signup" className="hover:text-fg">
            {t("footer.signup")}
          </Link>
          <LanguageSwitcher />
        </nav>
      </div>
    </footer>
  );
}
