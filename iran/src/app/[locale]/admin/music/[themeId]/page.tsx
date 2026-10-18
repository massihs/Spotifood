import { ChevronRight, Music } from "lucide-react";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { ThemeFlags, TrackRow, TrackUploader } from "@/components/music/admin-forms";
import { Card, CardHeader } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { fmtDuration } from "@/lib/duration";
import { requireSuperAdmin } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { getThemeForAdmin } from "@/server/modules/music/service";

export default function AdminThemePage({ params }: PageProps<"/[locale]/admin/music/[themeId]">) {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-surface-2" />}>
      <AdminTheme params={params} />
    </Suspense>
  );
}

async function AdminTheme({ params }: Pick<PageProps<"/[locale]/admin/music/[themeId]">, "params">) {
  const admin = await requireSuperAdmin();
  const { themeId } = await params;
  const [t, { theme, tracks }] = await Promise.all([
    getTranslations("music.admin"),
    getThemeForAdmin(db, admin, themeId),
  ]);
  const total = tracks.filter((x) => x.isActive).reduce((s, x) => s + x.durationSec, 0);

  return (
    <>
      <Link
        href="/admin/music"
        className="mb-4 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
      >
        <ChevronRight className="size-4 ltr:rotate-180" aria-hidden="true" />
        {t("title")}
      </Link>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <span
          className="grid size-16 place-items-center rounded-2xl text-white shadow-sm"
          style={{ background: `linear-gradient(135deg, ${theme.color}, ${theme.color}aa)` }}
        >
          <Music className="size-7" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{theme.name}</h1>
          <p className="text-sm text-fg-muted">
            {t("trackCount", { count: tracks.length })} ·{" "}
            <span className="tabular-nums">{fmtDuration(total)}</span>
            {theme.description ? ` · ${theme.description}` : ""}
          </p>
        </div>
        <ThemeFlags id={theme.id} isActive={theme.isActive} radioEnabled={theme.radioEnabled} />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <CardHeader title={t("tracks")} description={t("tracksHint")} />
          {tracks.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-fg-muted">{t("noTracks")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {tracks.map((tr) => (
                <TrackRow key={tr.id} track={tr} />
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-4 lg:sticky lg:top-24">
          <TrackUploader themeId={theme.id} />
        </Card>
      </div>
    </>
  );
}
