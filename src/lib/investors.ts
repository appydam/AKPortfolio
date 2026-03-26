// Big Bull Investor Registry
// Each superstar investor has a Trendlyne portfolio ID.
// NOTE: Trendlyne only shows holdings where someone holds >1% of a company.
// These are NOT full portfolios — just the publicly disclosed large positions.

export interface InvestorProfile {
  id: string;
  name: string;
  trendlyneId: string;
  trendlyneSlug: string;
  nameVariants: string[];
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
    description: "Small & mid-cap specialist. 48 disclosed holdings worth ~₹2,100+ Cr.",
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
    description: "Ace investor with 40+ disclosed holdings. Concentrated small & mid-cap approach.",
  },
  {
    id: "rakesh-jhunjhunwala",
    name: "Rakesh Jhunjhunwala (Personal)",
    trendlyneId: "53744",
    trendlyneSlug: "rakesh-jhunjhunwala-and-associates-portfolio",
    nameVariants: [
      "rakesh jhunjhunwala", "jhunjhunwala rakesh", "r jhunjhunwala",
    ],
    description: "The Big Bull's personal holdings (7 stocks). Bulk of portfolio is under Rare Enterprises & Rekha Jhunjhunwala.",
  },
  {
    id: "rare-enterprises",
    name: "Rare Enterprises (RJ Estate)",
    trendlyneId: "53799",
    trendlyneSlug: "rare-enterprises-portfolio",
    nameVariants: [
      "rare enterprises", "rare enterprises limited",
    ],
    description: "Rakesh Jhunjhunwala's investment vehicle. Manages the bulk of his legacy portfolio.",
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
    description: "SMILE philosophy investor. Very concentrated — only 3 disclosed >1% holdings.",
  },
  {
    id: "abakkus",
    name: "Abakkus (Sunil Singhania)",
    trendlyneId: "53790",
    trendlyneSlug: "abakkus-growth-fund-1-portfolio",
    nameVariants: [
      "sunil singhania", "abakkus growth fund", "abakkus emerging",
      "abakkus asset",
    ],
    description: "Ex-Reliance MF CIO. Trades through Abakkus fund, not personal name. 5 disclosed holdings.",
  },
];

export function getInvestorById(id: string): InvestorProfile | undefined {
  return INVESTORS.find(inv => inv.id === id);
}
