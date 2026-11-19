"use server";

import { refresh, updateTag } from "next/cache";
import { db } from "@/server/db/client";
import { actionContext, runAction } from "@/server/actions";
import { validation } from "@/server/errors";
import { menuTag } from "@/server/modules/menu/cache";
import { applyMenuImport, previewMenuImport } from "@/server/modules/menu/import";
import {
  fetchSnappfoodMenu,
  itemsToCsv,
  parseSnappfoodMenu,
  vendorCodeFromUrl,
} from "@/server/modules/menu/import-snappfood";

async function fileBytes(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw validation("import_empty");
  return new Uint8Array(await file.arrayBuffer());
}

export async function previewImportAction(restaurantId: string, formData: FormData) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId);
    return previewMenuImport(db, ctx, await fileBytes(formData));
  });
}

export async function applyImportAction(restaurantId: string, formData: FormData) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId);
    const res = await applyMenuImport(db, ctx, await fileBytes(formData));
    updateTag(menuTag(restaurantId));
    refresh();
    return res;
  });
}

/**
 * A Snappfood menu as the import spreadsheet: from the restaurant's Snappfood link, or from the
 * JSON copied from the page. The preview then shows every line before anything is created.
 */
export async function snappfoodCsvAction(
  restaurantId: string,
  input: { url: string; json: string; divideBy10: boolean },
) {
  return runAction(async () => {
    await actionContext(restaurantId, "menu.manage");
    let items;
    if (input.json.trim()) {
      try {
        items = parseSnappfoodMenu(JSON.parse(input.json));
      } catch {
        throw validation("import_empty");
      }
    } else {
      const code = vendorCodeFromUrl(input.url);
      if (!code) throw validation("invalid_snappfood_link");
      items = await fetchSnappfoodMenu(code).catch(() => {
        throw validation("snappfood_unreachable");
      });
    }
    if (!items.length) throw validation("import_empty");
    return { csv: itemsToCsv(items, input.divideBy10), count: items.length };
  });
}
