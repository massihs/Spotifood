"use client";

import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/input";
import { MoneyField } from "@/components/ui/money-field";
import {
  ActionForm,
  Checkbox,
  FormFeedback,
  SubmitButton,
  useActionForm,
  useCloseOnSuccess,
  useFieldError,
} from "@/components/ui/form";
import { recordPayoutAction, setPlatformPaymentsAction } from "./actions";

export function PlatformPaymentsForm({ feeBps, split }: { feeBps: number; split: boolean }) {
  const t = useTranslations("admin.payouts");
  const form = useActionForm(setPlatformPaymentsAction);
  const err = useFieldError(form.state);
  return (
    <ActionForm form={form} className="space-y-4">
      <div className="max-w-xs">
        <Field
          label={t("feeField")}
          name="feePct"
          inputMode="decimal"
          dir="ltr"
          defaultValue={String(feeBps / 100)}
          hint={t("feeHint")}
          error={err("feePct")}
        />
      </div>
      <Checkbox name="split" defaultChecked={split} label={t("split")} description={t("splitHint")} />
      <FormFeedback state={form.state} success={t("saved")} />
      <div className="flex justify-end">
        <SubmitButton>{t("save")}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function CopyText({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value).catch(() => undefined);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg"
      aria-label={label}
      title={label}
    >
      {done ? (
        <Check className="size-3.5" aria-hidden="true" />
      ) : (
        <Copy className="size-3.5" aria-hidden="true" />
      )}
    </button>
  );
}

export function PayoutDialog({
  restaurantId,
  name,
  currency,
  dueInput,
  dueLabel,
}: {
  restaurantId: string;
  name: string;
  currency: string;
  dueInput: string;
  dueLabel: string;
}) {
  const t = useTranslations("admin.payouts");
  return (
    <Dialog
      title={t("payTitle", { name })}
      description={t("payDue", { amount: dueLabel })}
      trigger={(open) => (
        <Button size="sm" onClick={open}>
          {t("pay")}
        </Button>
      )}
    >
      <PayoutForm restaurantId={restaurantId} currency={currency} dueInput={dueInput} />
    </Dialog>
  );
}

function PayoutForm({
  restaurantId,
  currency,
  dueInput,
}: {
  restaurantId: string;
  currency: string;
  dueInput: string;
}) {
  const t = useTranslations("admin.payouts");
  const form = useActionForm(recordPayoutAction);
  const err = useFieldError(form.state);
  useCloseOnSuccess(form.state);
  return (
    <ActionForm form={form} className="space-y-4">
      <input type="hidden" name="restaurantId" value={restaurantId} />
      <MoneyField
        label={t("amount")}
        name="amount"
        currency={currency}
        defaultValue={dueInput}
        error={err("amount")}
      />
      <Field
        label={t("reference")}
        name="reference"
        required
        dir="ltr"
        maxLength={64}
        hint={t("referenceHint")}
        error={err("reference")}
      />
      <Field label={t("note")} name="note" maxLength={500} />
      <FormFeedback state={form.state} />
      <div className="flex justify-end">
        <SubmitButton>{t("confirm")}</SubmitButton>
      </div>
    </ActionForm>
  );
}
