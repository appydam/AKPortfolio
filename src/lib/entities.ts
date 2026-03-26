// Ashish Kacholia trades through multiple entities.
// All scrapers and detectors MUST check ALL these names.
//
// Sources for entity discovery:
// - BSE/NSE bulk/block deal filings (client name field)
// - SEBI Shareholding Patterns (individual shareholder names)
// - MCA company filings (director names on Lucky Investment Managers)
// - Trendlyne portfolio page (associated entities)

export const KACHOLIA_ENTITIES = [
  // ─── Primary — Ashish himself ───
  "ashish kacholia",
  "ashish rameshchandra kacholia",
  "kacholia ashish rameshchandra",
  "ashish r kacholia",
  "ashish r. kacholia",
  "a kacholia",
  "a.kacholia",
  "kacholia ashish",
  "mr ashish kacholia",
  "mr. ashish kacholia",
  "mr ashish rameshchandra kacholia",

  // ─── Wife — Rashmi ───
  "rashmi ashish kacholia",
  "rashmi kacholia",
  "kacholia rashmi",
  "rashmi a kacholia",
  "rashmi a. kacholia",
  "r kacholia",
  "r.kacholia",
  "mrs rashmi kacholia",
  "mrs. rashmi kacholia",
  "mrs rashmi ashish kacholia",
  "smt rashmi kacholia",

  // ─── HUF (Hindu Undivided Family) ───
  "ashish kacholia huf",
  "ashish rameshchandra kacholia huf",
  "kacholia ashish huf",
  "a kacholia huf",
  "a.kacholia huf",
  "ashish kacholia (huf)",
  "ashish r kacholia huf",
  "huf ashish kacholia",
  "rashmi kacholia huf",
  "rashmi ashish kacholia huf",

  // ─── Lucky Investment Managers Pvt Ltd (associated company) ───
  "lucky investment managers",
  "lucky investment managers pvt",
  "lucky investment managers private limited",
  "lucky investment managers pvt ltd",
  "lucky investment managers pvt. ltd.",
  "lucky investment managers pvt. ltd",
  "lucky investment managers private ltd",
  "lucky investment",
  "lucky investments",
  "m/s lucky investment",

  // ─── Potential family / associated entities ───
  // Ashish's father (common in HUF structures)
  "rameshchandra kacholia",
  "r.c. kacholia",
  "rc kacholia",
  // Children (adult children may trade separately)
  // These are speculative — will be validated against actual filings
  "kacholia family",
];

/**
 * Check if a name belongs to any known Kacholia entity.
 * Uses substring matching — intentionally loose to catch filing variants.
 */
export function isKacholiaEntity(name: string): boolean {
  const lower = name.toLowerCase().trim();
  return KACHOLIA_ENTITIES.some((v) => lower.includes(v));
}

// Entity classification — which Kacholia entity is this?
export type KacholiaEntityType =
  | "self"
  | "wife"
  | "huf"
  | "company"
  | "family"
  | "unknown";

export function classifyEntity(name: string): KacholiaEntityType {
  const lower = name.toLowerCase().trim();
  if (lower.includes("rashmi")) return "wife";
  if (lower.includes("huf")) return "huf";
  if (lower.includes("lucky investment")) return "company";
  if (lower.includes("rameshchandra") && !lower.includes("ashish")) return "family";
  if (lower.includes("kacholia family")) return "family";
  if (lower.includes("kacholia") || lower.includes("ashish")) return "self";
  return "unknown";
}

/**
 * Normalize entity name for consistent storage.
 * Maps all variants to a canonical form.
 */
export function normalizeEntityName(name: string): string {
  const type = classifyEntity(name);
  switch (type) {
    case "self":
      return "Ashish Kacholia";
    case "wife":
      return "Rashmi Kacholia";
    case "huf":
      return name.toLowerCase().includes("rashmi")
        ? "Rashmi Kacholia HUF"
        : "Ashish Kacholia HUF";
    case "company":
      return "Lucky Investment Managers Pvt Ltd";
    case "family":
      return "Kacholia Family";
    default:
      return name.trim();
  }
}

// All entity types for DB storage
export const ENTITY_TYPES = ["self", "wife", "huf", "company", "family"] as const;
