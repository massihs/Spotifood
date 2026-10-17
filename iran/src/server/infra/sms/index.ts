/**
 * Text messages. `SMS_PROVIDER=console` (default) only logs; `kavenegar` sends through
 * Kavenegar (https://kavenegar.com) with `KAVENEGAR_API_KEY` and an optional `KAVENEGAR_SENDER` line.
 */
export interface SmsDriver {
  readonly name: string;
  send(to: string, text: string): Promise<{ ref: string | null }>;
}

class ConsoleSms implements SmsDriver {
  readonly name = "console";
  async send(to: string, text: string) {
    console.log(`[sms:console] → ${to.slice(0, 4)}…${to.slice(-2)}: ${text}`);
    return { ref: null };
  }
}

class KavenegarSms implements SmsDriver {
  readonly name = "kavenegar";
  constructor(
    private readonly apiKey: string,
    private readonly sender?: string,
  ) {}

  async send(to: string, text: string) {
    const body = new URLSearchParams({ receptor: to, message: text });
    if (this.sender) body.set("sender", this.sender);
    const res = await fetch(`https://api.kavenegar.com/v1/${encodeURIComponent(this.apiKey)}/sms/send.json`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json().catch(() => null)) as {
      return?: { status?: number; message?: string };
      entries?: { messageid?: number }[];
    } | null;
    if (!res.ok || json?.return?.status !== 200)
      throw new Error(`kavenegar ${res.status}: ${json?.return?.message ?? "no response"}`);
    const id = json.entries?.[0]?.messageid;
    return { ref: id ? String(id) : null };
  }
}

let driver: SmsDriver | null = null;

export function sms(): SmsDriver {
  if (driver) return driver;
  const provider = process.env.SMS_PROVIDER ?? "console";
  if (provider === "kavenegar") {
    const key = process.env.KAVENEGAR_API_KEY;
    if (!key) {
      console.warn("[sms] SMS_PROVIDER=kavenegar but KAVENEGAR_API_KEY is missing: logging only");
      driver = new ConsoleSms();
    } else driver = new KavenegarSms(key, process.env.KAVENEGAR_SENDER || undefined);
  } else driver = new ConsoleSms();
  return driver;
}

/** Tests: swap the driver. */
export function setSmsDriver(d: SmsDriver | null) {
  driver = d;
}
