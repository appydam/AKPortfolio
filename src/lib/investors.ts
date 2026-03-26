// Big Bull Investor Registry
// Each superstar investor has a Trendlyne portfolio ID and known name variants.

export interface InvestorProfile {
  id: string; // unique slug
  name: string;
  trendlyneId: string; // Trendlyne portfolio ID for scraping
  trendlyneSlug: string;
  nameVariants: string[]; // for matching in bulk deal data
  description: string;
}

export const INVESTORS: InvestorProfile[] = [
  {
    id: "ashish-kacholia",
    name: "Ashish Kacholia",
    trendlyneId: "53746",
    trendlyneSlug: "ashish-kacholia-portfolio",
    nameVariants: [
      "ashish kacholia", "ashish rameshchandra kacholia",
      "kacholia ashish", "rashmi ashish kacholia", "rashmi kacholia",
      "ashish kacholia huf", "lucky investment managers",
    ],
    description: "Small & mid-cap specialist. Known for high-conviction bets in niche companies.",
  },
  {
    id: "dolly-khanna",
    name: "Dolly Khanna",
    trendlyneId: "53671",
    trendlyneSlug: "dolly-khanna-portfolio",
    nameVariants: [
      "dolly khanna", "rajiv khanna", "dolly r khanna",
      "khanna dolly", "dolly rajiv khanna",
    ],
    description: "Chennai-based investor guided by husband Rajiv Khanna. Focuses on textile, sugar, and chemical sectors.",
  },
  {
    id: "vijay-kedia",
    name: "Vijay Kedia",
    trendlyneId: "53749",
    trendlyneSlug: "vijay-kedia-portfolio",
    nameVariants: [
      "vijay kedia", "vijay kishanlal kedia", "kedia vijay",
      "kedia securities", "v kedia",
    ],
    description: "SMILE philosophy investor (Small cap, Medium cap, Large cap, Extra-large, Elephant). Deep value player.",
  },
  {
    id: "sunil-singhania",
    name: "Sunil Singhania",
    trendlyneId: "53701",
    trendlyneSlug: "sunil-singhania-portfolio",
    nameVariants: [
      "sunil singhania", "abakkus growth fund", "abakkus emerging",
      "abakkus asset", "singhania sunil",
    ],
    description: "Former CIO of Reliance MF. Now runs Abakkus Asset Management. Growth-focused institutional style.",
  },
  {
    id: "rakesh-jhunjhunwala",
    name: "Rakesh Jhunjhunwala (Estate)",
    trendlyneId: "53744",
    trendlyneSlug: "rakesh-jhunjhunwala-and-associates-portfolio",
    nameVariants: [
      "rakesh jhunjhunwala", "rekha jhunjhunwala", "rare enterprises",
      "jhunjhunwala rakesh", "r jhunjhunwala",
    ],
    description: "The Big Bull's legacy portfolio, now managed by Rekha Jhunjhunwala and Rare Enterprises.",
  },
  {
    id: "mukul-agrawal",
    name: "Mukul Agrawal",
    trendlyneId: "53748",
    trendlyneSlug: "mukul-mahavir-prasad-agrawal-portfolio",
    nameVariants: [
      "mukul agrawal", "mukul mahavir prasad agrawal",
      "agrawal mukul", "m agrawal",
    ],
    description: "Ace investor known for mid-cap and small-cap picks. Concentrated portfolio approach.",
  },
];

export function getInvestorById(id: string): InvestorProfile | undefined {
  return INVESTORS.find(inv => inv.id === id);
}

export function getInvestorByName(name: string): InvestorProfile | undefined {
  const lower = name.toLowerCase();
  return INVESTORS.find(inv =>
    inv.nameVariants.some(v => lower.includes(v))
  );
}
