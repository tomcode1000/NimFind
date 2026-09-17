/** Returns the canonical spaced Nimiq address, or null when the checksum or format is wrong. */
export function normalizeAddress(input: string): string | null {
  const compact = input.replace(/\s+/g, "").toUpperCase();
  if (!/^NQ[0-9]{2}[0-9A-HJ-NP-VXY]{32}$/.test(compact)) return null;
  const digits = (compact.slice(4) + compact.slice(0, 4))
    .split("")
    .map((char) => parseInt(char, 36).toString())
    .join("");
  let remainder = 0;
  for (let i = 0; i < digits.length; i += 6) remainder = parseInt(`${remainder}${digits.slice(i, i + 6)}`, 10) % 97;
  return remainder === 1 ? compact.match(/.{4}/g)!.join(" ") : null;
}
