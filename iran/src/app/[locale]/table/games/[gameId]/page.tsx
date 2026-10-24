import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { GuestTopBar } from "@/components/guest/cart-view";
import { GameBoard } from "@/components/guest/games/board";
import { GuestSkeleton, SessionExpired } from "@/components/guest/states";
import { LiveIndicator, LiveProvider } from "@/components/realtime/live";
import { isUuid } from "@/lib/ids";
import { menuThemeOf } from "@/lib/menu-themes";
import { db } from "@/server/db/client";
import { isAppError } from "@/server/errors";
import { gameHeartbeat } from "@/server/modules/games/service";
import { getGuest } from "@/server/modules/guest/current";

type Props = PageProps<"/[locale]/table/games/[gameId]">;

export default function GamePage({ params }: Props) {
  return (
    <Suspense fallback={<GuestSkeleton />}>
      <Game params={params} />
    </Suspense>
  );
}

async function Game({ params }: Pick<Props, "params">) {
  const { gameId } = await params;
  const guest = await getGuest();
  if (!guest) return <SessionExpired />;
  if (!isUuid(gameId)) notFound();
  const view = await gameHeartbeat(db, guest, gameId).catch((e) => {
    if (isAppError(e) && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  const t = await getTranslations("games");
  return (
    <LiveProvider url="/api/v1/realtime/guest">
      <div data-brand={guest.restaurant.brandColor} className="contents">
        <div data-menu-theme={menuThemeOf(guest.restaurant.menuTheme)}>
          <GuestTopBar
            title={t("backgammon")}
            subtitle={t("matchTo", { n: view.target })}
            backHref="/table/games"
            extra={<LiveIndicator className="rounded-full bg-surface-2 px-3 py-1.5" />}
          />
          <main className="mx-auto max-w-xl px-3 pt-3 pb-10">
            <GameBoard initial={JSON.parse(JSON.stringify(view))} />
          </main>
        </div>
      </div>
    </LiveProvider>
  );
}
