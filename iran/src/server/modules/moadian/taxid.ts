/**
 * The tax id of an invoice (شماره منحصر به فرد مالیاتی, 22 characters), as the tax system
 * (سامانه مؤدیان) defines it: the fiscal memory id (6), the day of issue in hex (5), the invoice
 * serial in hex (10), and a Verhoeff check digit (1) computed on the decimal form of the three.
 */

const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
const INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

/** The Verhoeff check digit of a string of digits. */
export function verhoeff(digits: string) {
  let c = 0;
  const rev = digits.split("").reverse();
  for (let i = 0; i < rev.length; i++) c = D[c]![P[(i + 1) % 8]![Number(rev[i])]!]!;
  return String(INV[c]);
}

/** True when the last digit is the Verhoeff check digit of the others. */
export const verhoeffValid = (digits: string) => verhoeff(digits.slice(0, -1)) === digits.slice(-1);

/** The memory id in digits: digits stay, a letter becomes its character code (A → 65). */
export const memoryIdDigits = (memoryId: string) =>
  memoryId
    .toUpperCase()
    .split("")
    .map((ch) => (/\d/.test(ch) ? ch : String(ch.charCodeAt(0))))
    .join("");

export const MEMORY_ID = /^[A-Z0-9]{6}$/;

export function taxId(memoryId: string, issuedAt: Date, serial: number) {
  const mid = memoryId.toUpperCase();
  if (!MEMORY_ID.test(mid)) throw new Error("invalid_memory_id");
  if (!Number.isInteger(serial) || serial < 0 || serial > 0xffffffffff) throw new Error("invalid_serial");
  const days = Math.floor(issuedAt.getTime() / 86_400_000);
  const check = verhoeff(
    memoryIdDigits(mid).padStart(6, "0") + String(days).padStart(6, "0") + String(serial).padStart(12, "0"),
  );
  return `${mid}${days.toString(16).padStart(5, "0")}${serial.toString(16).padStart(10, "0")}${check}`.toUpperCase();
}
