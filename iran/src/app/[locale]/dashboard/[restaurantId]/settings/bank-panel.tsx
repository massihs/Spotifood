"use client";

import { BadgeCheck, Landmark, Lock, Pencil, Trash2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { ActionForm, FormFeedback, SubmitButton, useActionForm, useFieldError } from "@/components/ui/form";
import {
  bankCodeOf,
  bankName,
  isValidCard,
  isValidIban,
  maskCard,
  maskIban,
  normalizeIban,
} from "@/lib/iban";
import { removePayoutAccountAction, savePayoutAccountAction } from "./actions";

export type PayoutAccountValues = {
  holderName: string;
  ibanLast4: string;
  bankCode: string;
  cardLast4: string | null;
  updatedAt: string;
} | null;

/**
 * Where Spotifood pays the restaurant the online payments it collects for it. The full numbers
 * never come back to the browser once saved: changing them means typing them again.
 */
export function BankPanel({
  restaurantId,
  account,
  canEdit,
  locale,
}: {
  restaurantId: string;
  account: PayoutAccountValues;
  canEdit: boolean;
  locale: string;
}) {
  const t = useTranslations("settings.payout");
  const format = useFormatter();
  const [editing, setEditing] = useState(!account && canEdit);
  const [removing, startRemove] = useTransition();
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const te = useTranslations("errorCodes");

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 rounded-2xl bg-surface-2 px-4 py-3 text-sm text-fg-muted">
        <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {t("privacy")}
      </p>
      {saved && account && !editing ? (
        <p role="status" className="flex items-center gap-1.5 text-sm font-medium text-success">
          <BadgeCheck className="size-4" aria-hidden="true" />
          {t("saved")}
        </p>
      ) : null}
      {account && !editing ? (
        <div className="rounded-2xl border border-border p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-text">
                <Landmark className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 space-y-1">
                <p className="font-semibold">{account.holderName}</p>
                <p className="font-mono text-sm tracking-wide" dir="ltr">
                  {maskIban(account.ibanLast4)}
                </p>
                <p className="text-sm text-fg-muted">
                  {bankName(account.bankCode, locale) ?? t("bankUnknown")}
                  {account.cardLast4 ? (
                    <>
                      {" · "}
                      <span dir="ltr">{maskCard(account.cardLast4)}</span>
                    </>
                  ) : null}
                </p>
                <p className="text-xs text-fg-subtle">
                  {t("updated", {
                    when: format.dateTime(new Date(account.updatedAt), { dateStyle: "medium" }),
                  })}
                </p>
              </div>
            </div>
            {canEdit ? (
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSaved(false);
                    setEditing(true);
                  }}
                >
                  <Pencil className="size-4" aria-hidden="true" />
                  {t("change")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={removing}
                  onClick={() => {
                    if (!window.confirm(t("removeConfirm"))) return;
                    startRemove(async () => {
                      const res = await removePayoutAccountAction(restaurantId);
                      if (!res || res.ok) setRemoveError(null);
                      else setRemoveError(te.has(res.error) ? te(res.error) : te("internal"));
                    });
                  }}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                  {t("remove")}
                </Button>
              </div>
            ) : null}
          </div>
          {removeError ? (
            <p role="alert" className="mt-3 text-sm text-danger">
              {removeError}
            </p>
          ) : null}
        </div>
      ) : null}
      {!account && !canEdit ? <p className="text-sm text-fg-muted">{t("ownerOnlyEmpty")}</p> : null}
      {account && !canEdit ? <p className="text-xs text-fg-subtle">{t("ownerOnly")}</p> : null}
      {editing && canEdit ? (
        <AccountForm
          restaurantId={restaurantId}
          locale={locale}
          onDone={account ? () => setEditing(false) : undefined}
          onSaved={() => {
            setEditing(false);
            setSaved(true);
          }}
          defaultHolder={account?.holderName ?? ""}
        />
      ) : null}
    </div>
  );
}

function AccountForm({
  restaurantId,
  locale,
  onDone,
  onSaved,
  defaultHolder,
}: {
  restaurantId: string;
  locale: string;
  onDone?: () => void;
  /** Saved: back to the masked view (the full numbers are not shown again). */
  onSaved: () => void;
  defaultHolder: string;
}) {
  const t = useTranslations("settings.payout");
  const form = useActionForm(savePayoutAccountAction.bind(null, restaurantId));
  const err = useFieldError(form.state);
  useEffect(() => {
    if (form.state?.ok) onSaved();
  }, [form.state, onSaved]);
  const [iban, setIban] = useState("");
  const [card, setCard] = useState("");
  const ibanOk = isValidIban(iban);
  const bank = ibanOk ? bankName(bankCodeOf(iban), locale) : null;
  const ibanTyped = normalizeIban(iban).length >= 26;
  const cardTyped = card.replace(/\D/g, "").length >= 16;
  return (
    <ActionForm form={form} className="space-y-4 rounded-2xl border border-border p-4">
      <Field
        label={t("holder")}
        name="holderName"
        required
        maxLength={120}
        autoComplete="name"
        defaultValue={defaultHolder}
        hint={t("holderHint")}
        error={err("holderName")}
      />
      <div className="space-y-1.5">
        <Field
          label={t("iban")}
          name="iban"
          required
          dir="ltr"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="IR00 0000 0000 0000 0000 0000 00"
          value={iban}
          onChange={(e) => setIban(e.target.value)}
          className="font-mono tracking-wide uppercase"
          error={err("iban") ?? (ibanTyped && !ibanOk ? t("ibanInvalid") : undefined)}
          hint={t("ibanHint")}
        />
        {ibanOk ? (
          <p className="flex items-center gap-1.5 text-sm font-medium text-success">
            <BadgeCheck className="size-4" aria-hidden="true" />
            {bank ?? t("ibanValid")}
          </p>
        ) : null}
      </div>
      <Field
        label={t("card")}
        name="card"
        dir="ltr"
        inputMode="numeric"
        autoComplete="off"
        placeholder="0000 0000 0000 0000"
        value={card}
        onChange={(e) => setCard(e.target.value)}
        className="font-mono tracking-wide"
        error={err("card") ?? (cardTyped && !isValidCard(card) ? t("cardInvalid") : undefined)}
        hint={t("cardHint")}
      />
      <FormFeedback state={form.state} success={t("saved")} />
      <div className="flex flex-wrap justify-end gap-2">
        {onDone ? (
          <Button variant="ghost" onClick={onDone}>
            {t("cancel")}
          </Button>
        ) : null}
        <SubmitButton disabled={!ibanOk}>{t("save")}</SubmitButton>
      </div>
    </ActionForm>
  );
}
