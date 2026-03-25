// Ashish Kacholia trades through multiple entities.
// All scrapers and detectors MUST check ALL these names.

export const KACHOLIA_ENTITIES = [
  // Primary — Ashish himself
  "ashish kacholia",
  "ashish rameshchandra kacholia",
  "kacholia ashish rameshchandra",
  "ashish r kacholia",
  "a kacholia",
  "a.kacholia",
  "kacholia ashish",
  // Wife — Rashmi
  "rashmi ashish kacholia",
  "rashmi kacholia",
  "kacholia rashmi",
  "rashmi a kacholia",
  "r kacholia",
  "r.kacholia",
  // HUF
  "ashish kacholia huf",
  "ashish rameshchandra kacholia huf",
  "kacholia ashish huf",
  "a kacholia huf",
  // Associated company
  "lucky investment managers",
  "lucky investment managers pvt",
  "lucky investment managers private limited",
  "lucky investment managers pvt ltd",
  "lucky investment",
];

export function isKacholiaEntity(name: string): boolean {
  const lower = name.toLowerCase().trim();
  return KACHOLIA_ENTITIES.some((v) => lower.includes(v));
}

// Entity classification — which Kacholia entity is this?
export type KacholiaEntityType = "self" | "wife" | "huf" | "company" | "unknown";

export function classifyEntity(name: string): KacholiaEntityType {
  const lower = name.toLowerCase().trim();
  if (lower.includes("rashmi")) return "wife";
  if (lower.includes("huf")) return "huf";
  if (lower.includes("lucky investment")) return "company";
  if (lower.includes("kacholia") || lower.includes("ashish")) return "self";
  return "unknown";
}
