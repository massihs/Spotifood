"use client";

import { useEffect } from "react";

/**
 * Opens a page's "new …" sheet when the URL asks for it (`?create=booking`): the dashboard's
 * Create menu links straight to the form. The parameter is then removed, so a reload or a back
 * does not open it again.
 */
export function useCreateParam(key: string, open: () => void) {
  useEffect(() => {
    if (new URL(window.location.href).searchParams.get("create") !== key) return;
    // After the navigation has settled (it would put the parameter back otherwise).
    const id = window.setTimeout(() => {
      const url = new URL(window.location.href);
      url.searchParams.delete("create");
      window.history.replaceState(window.history.state, "", url);
      open();
    }, 50);
    return () => window.clearTimeout(id);
  }, [key, open]);
}

/** Stable openers for the common shapes of "is the sheet open" state. */
const openers = new WeakMap<object, () => void>();
export function openSheet(setOpen: (v: boolean) => void) {
  let fn = openers.get(setOpen);
  if (!fn) openers.set(setOpen, (fn = () => setOpen(true)));
  return fn;
}
export function openNew<T>(setEdit: (v: T | "new") => void) {
  let fn = openers.get(setEdit);
  if (!fn) openers.set(setEdit, (fn = () => setEdit("new")));
  return fn;
}
