"use client";

import { useEffect } from "react";
import { ErrorScreen } from "@/components/site/error-screen";

/** An unexpected error anywhere on the site: a calm page with "try again", never a blank screen. */
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return <ErrorScreen kind="error" digest={error.digest} onRetry={retry} />;
}
