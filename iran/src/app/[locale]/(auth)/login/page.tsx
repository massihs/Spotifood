import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LoginForm } from "../auth-forms";

export const metadata: Metadata = { robots: { index: false } };

export default async function LoginPage({ params }: PageProps<"/[locale]/login">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth");
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{t("loginTitle")}</h1>
      <p className="mt-1.5 text-fg-muted">{t("loginSubtitle")}</p>
      <div className="mt-8">
        <LoginForm />
      </div>
      <p className="mt-6 text-center text-sm text-fg-muted">
        {t("noAccount")}{" "}
        <Link href="/signup" className="font-medium text-accent-text hover:underline">
          {t("goSignup")}
        </Link>
      </p>
      <p className="mt-3 text-center text-sm">
        <Link href="/pro" className="font-medium text-fg-muted hover:text-fg hover:underline">
          {t("pro.loginLink")}
        </Link>
      </p>
    </div>
  );
}
