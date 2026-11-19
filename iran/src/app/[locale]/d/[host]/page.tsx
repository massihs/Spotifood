import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { db } from "@/server/db/client";
import { slugForDomain } from "@/server/modules/channels/domain";
import OnlineOrderPage, { generateMetadata as orderMetadata } from "../../r/[slug]/order/page";

/**
 * The restaurant's own domain (order.myrestaurant.ir): the proxy sends its home page here, and it
 * shows the same ordering site as /r/{slug}/order, under the restaurant's name, with no commission.
 */
type Props = PageProps<"/[locale]/d/[host]">;
type OrderProps = Parameters<typeof OnlineOrderPage>[0];

async function slugOf(params: Props["params"]) {
  const { locale, host } = await params;
  const slug = await slugForDomain(db, decodeURIComponent(host));
  return slug ? { locale, slug } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await slugOf(params);
  return p ? orderMetadata({ params: Promise.resolve(p) } as OrderProps) : {};
}

export default function CustomDomainPage({ params }: Props) {
  return (
    <Suspense fallback={<div className="h-80 animate-pulse bg-surface-2" />}>
      <Resolved params={params} />
    </Suspense>
  );
}

async function Resolved({ params }: Pick<Props, "params">) {
  const p = await slugOf(params);
  if (!p) notFound();
  return <OnlineOrderPage {...({ params: Promise.resolve(p) } as OrderProps)} />;
}
