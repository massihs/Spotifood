/**
 * Iranian bank details: Sheba numbers (IBAN, "IR" + 24 digits) and card numbers (16 digits).
 * Shared by the forms (instant feedback) and the server (the only check that counts).
 */

/** Persian / Arabic digits → ASCII; spaces, dashes and invisible marks removed. */
export function cleanDigits(v: string) {
  return v
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\s\-_.\u200c\u200e\u200f]/g, "")
    .toUpperCase();
}

/** "IR06 0170 …", "06017…" (24 digits without IR), Persian digits: all become "IR06017…". */
export function normalizeIban(v: string) {
  const c = cleanDigits(v);
  return /^\d{24}$/.test(c) ? `IR${c}` : c;
}

/** ISO 13616 check (mod 97 = 1) on an Iranian Sheba number. */
export function isValidIban(v: string) {
  const iban = normalizeIban(v);
  if (!/^IR\d{24}$/.test(iban)) return false;
  const moved = iban.slice(4) + iban.slice(0, 4);
  const digits = moved.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));
  let rest = 0;
  for (const d of digits) rest = (rest * 10 + Number(d)) % 97;
  return rest === 1;
}

/** Bank identifier inside a Sheba number (digits 3–5 after "IR"). */
export const bankCodeOf = (iban: string) => normalizeIban(iban).slice(4, 7);

/** Names of the banks most restaurants use, by Sheba bank code (others show no name). */
const BANKS: Record<string, { fa: string; en: string }> = {
  "010": { fa: "بانک مرکزی", en: "Central Bank of Iran" },
  "011": { fa: "بانک صنعت و معدن", en: "Bank of Industry and Mine" },
  "012": { fa: "بانک ملت", en: "Bank Mellat" },
  "013": { fa: "بانک رفاه کارگران", en: "Refah Bank" },
  "014": { fa: "بانک مسکن", en: "Bank Maskan" },
  "015": { fa: "بانک سپه", en: "Bank Sepah" },
  "016": { fa: "بانک کشاورزی", en: "Bank Keshavarzi" },
  "017": { fa: "بانک ملی ایران", en: "Bank Melli Iran" },
  "018": { fa: "بانک تجارت", en: "Tejarat Bank" },
  "019": { fa: "بانک صادرات ایران", en: "Bank Saderat Iran" },
  "020": { fa: "بانک توسعه صادرات", en: "Export Development Bank" },
  "021": { fa: "پست بانک", en: "Post Bank" },
  "022": { fa: "بانک توسعه تعاون", en: "Tose'e Ta'avon Bank" },
  "053": { fa: "بانک کارآفرین", en: "Karafarin Bank" },
  "054": { fa: "بانک پارسیان", en: "Parsian Bank" },
  "055": { fa: "بانک اقتصاد نوین", en: "EN Bank" },
  "056": { fa: "بانک سامان", en: "Saman Bank" },
  "057": { fa: "بانک پاسارگاد", en: "Bank Pasargad" },
  "058": { fa: "بانک سرمایه", en: "Sarmayeh Bank" },
  "059": { fa: "بانک سینا", en: "Sina Bank" },
  "060": { fa: "بانک قرض‌الحسنه مهر ایران", en: "Mehr Iran Bank" },
  "061": { fa: "بانک شهر", en: "City Bank" },
  "062": { fa: "بانک آینده", en: "Ayandeh Bank" },
  "064": { fa: "بانک گردشگری", en: "Tourism Bank" },
  "065": { fa: "بانک دی", en: "Day Bank" },
  "066": { fa: "بانک ایران زمین", en: "Iran Zamin Bank" },
  "070": { fa: "بانک قرض‌الحسنه رسالت", en: "Resalat Bank" },
  "078": { fa: "بانک خاورمیانه", en: "Middle East Bank" },
};

export function bankName(code: string, locale: string) {
  const b = BANKS[code];
  if (!b) return null;
  return locale === "fa" || locale === "ar" ? b.fa : b.en;
}

/** "IR•• •••• … •••• 3456": what is shown once the number is saved. */
export const maskIban = (last4: string) =>
  `IR•• •••• •••• •••• •••• ••${last4.slice(0, 2)} ${last4.slice(2)}`;
export const maskCard = (last4: string) => `•••• •••• •••• ${last4}`;

/** Bank cards follow the Luhn checksum. */
export function isValidCard(v: string) {
  const c = cleanDigits(v);
  if (!/^\d{16}$/.test(c)) return false;
  let sum = 0;
  for (let i = 0; i < 16; i++) {
    let d = Number(c[15 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}
