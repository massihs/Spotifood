import { randomUUID } from "node:crypto";
import { jwe, jws } from "./jose";
import type { MoadianInvoice } from "./invoice";

/**
 * The tax system's API (سامانه مؤدیان, version 2): a nonce signed with the taxpayer's key gives a
 * token; invoices go signed and encrypted, the answer gives a reference number per invoice; the
 * inquiry tells, later, whether each one was accepted.
 */

export const MOADIAN_URLS = {
  production: "https://tp.tax.gov.ir/requestsmanager",
  sandbox: "https://sandboxrc.tax.gov.ir/requestsmanager",
} as const;

export type MoadianAuth = {
  baseUrl: string;
  memoryId: string;
  privateKeyPem: string;
  certPem?: string | null;
};
export type SendResult = { uid: string; referenceNumber: string | null; error: string | null };
export type InquiryResult = {
  referenceNumber: string;
  status: "SUCCESS" | "FAILED" | "PENDING";
  error: string | null;
};

export function moadianClient(auth: MoadianAuth, f: typeof fetch = fetch) {
  const url = (path: string) => `${auth.baseUrl.replace(/\/$/, "")}/api/v2/${path}`;
  const json = async (res: Response) => {
    const body = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) throw new Error(`moadian ${res.status}: ${JSON.stringify(body)?.slice(0, 300)}`);
    return body;
  };
  let token: { value: string; until: number } | null = null;

  async function getToken() {
    if (token && token.until > Date.now()) return token.value;
    const { nonce } = (await json(
      await f(url("nonce?timeToLive=20"), { signal: AbortSignal.timeout(15_000) }),
    )) as {
      nonce: string;
    };
    const value = jws({ nonce, clientId: auth.memoryId }, auth.privateKeyPem, auth.certPem);
    token = { value, until: Date.now() + 15_000 };
    return value;
  }

  async function serverKey() {
    const info = (await json(
      await f(url("server-information"), { signal: AbortSignal.timeout(15_000) }),
    )) as {
      publicKeys: { key: string; id: string }[];
    };
    const k = info.publicKeys?.[0];
    if (!k) throw new Error("moadian: no server key");
    return k;
  }

  return {
    async send(invoices: { uid: string; invoice: MoadianInvoice }[]): Promise<SendResult[]> {
      if (!invoices.length) return [];
      const [key, t] = await Promise.all([serverKey(), getToken()]);
      const traceId = randomUUID();
      const body = invoices.map((i) => ({
        payload: jwe(jws(i.invoice, auth.privateKeyPem, auth.certPem), key.key, key.id),
        header: { requestTraceId: i.uid, fiscalId: auth.memoryId },
      }));
      const res = (await json(
        await f(url("invoice"), {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${t}`,
            requestTraceId: traceId,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(30_000),
        }),
      )) as {
        result?: {
          uid: string;
          referenceNumber?: string | null;
          errorCode?: string | null;
          errorDetail?: string | null;
        }[];
      };
      return (res.result ?? []).map((r) => ({
        uid: r.uid,
        referenceNumber: r.referenceNumber ?? null,
        error: r.errorCode ? `${r.errorCode}: ${r.errorDetail ?? ""}`.trim() : null,
      }));
    },

    async inquiry(referenceNumbers: string[]): Promise<InquiryResult[]> {
      if (!referenceNumbers.length) return [];
      const t = await getToken();
      const qs = new URLSearchParams();
      for (const r of referenceNumbers) qs.append("referenceIds", r);
      const res = (await json(
        await f(url(`inquiry-by-reference-id?${qs}`), {
          headers: { authorization: `Bearer ${t}` },
          signal: AbortSignal.timeout(30_000),
        }),
      )) as {
        referenceNumber: string;
        status: string;
        data?: { error?: { message?: string; code?: string }[] };
      }[];
      return (Array.isArray(res) ? res : []).map((r) => ({
        referenceNumber: r.referenceNumber,
        status: r.status === "SUCCESS" ? "SUCCESS" : r.status === "FAILED" ? "FAILED" : "PENDING",
        error: r.data?.error?.length
          ? r.data.error.map((e) => `${e.code ?? ""} ${e.message ?? ""}`.trim()).join(" · ")
          : null,
      }));
    },
  };
}
