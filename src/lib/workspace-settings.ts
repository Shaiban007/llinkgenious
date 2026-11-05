/**
 * Workspace settings are stored as JSON on the workspace row. This file defines their shape
 * and sensible defaults for an Indian rice & spice exporter (Midas Trading House).
 * Everything here is editable on the Settings page — nothing is hard-wired into the scoring.
 */

export type ScoringWeights = {
  industry: number;
  designation: number;
  companySize: number;
  location: number;
  icp: number;
  information: number;
  freshness: number;
};

export type IcpConfig = {
  industries: string[]; // keywords matched against the lead's industry
  titles: string[]; // keywords matched against the job title
  sizes: string[]; // preferred company sizes, e.g. "11-50"
  locations: string[]; // preferred countries / cities
  keywords: string[]; // keywords describing the ideal customer (matched against company, industry, interests)
};

export type ScoringConfig = {
  weights: ScoringWeights;
  icp: IcpConfig;
  thresholds: { high: number; good: number; medium: number };
  freshnessDays: number;
};

export type WorkspacePrefs = {
  notifyFollowUps: boolean;
  notifyTasks: boolean;
  notifyCampaigns: boolean;
  staleLeadDays: number;
  dashboardRange: string;
  defaultCurrency: string;
};

export type EmailSettings = {
  fromName: string;
  fromEmail: string;
  replyTo: string;
  signature: string;
  unsubscribeFooter: string;
  physicalAddress: string;
  dailyLimit: number;
};

export type WorkspaceSettings = {
  scoring: ScoringConfig;
  prefs: WorkspacePrefs;
  email: EmailSettings;
};

export const DEFAULT_SETTINGS: WorkspaceSettings = {
  scoring: {
    weights: { industry: 20, designation: 20, companySize: 15, location: 10, icp: 20, information: 10, freshness: 5 },
    icp: {
      industries: [
        "food",
        "grocery",
        "supermarket",
        "wholesale",
        "distribution",
        "import",
        "spice",
        "rice",
        "grain",
        "agri",
        "commodit",
        "fmcg",
        "catering",
        "restaurant",
        "trading",
      ],
      titles: ["procure", "purchas", "sourcing", "buyer", "import", "category manager", "owner", "founder", "managing director", "director", "ceo", "proprietor", "partner"],
      sizes: ["11-50", "51-200", "201-500"],
      locations: ["United Arab Emirates", "UAE", "Dubai", "Saudi Arabia", "Qatar", "Kuwait", "Oman", "Bahrain", "United States", "USA", "United Kingdom", "UK", "Canada", "Germany", "Netherlands", "Malaysia", "Singapore", "South Africa"],
      keywords: ["importer", "import", "wholesale", "distributor", "trading", "rice", "basmati", "turmeric", "spice", "grain", "commodity"],
    },
    thresholds: { high: 80, good: 60, medium: 40 },
    freshnessDays: 90,
  },
  prefs: {
    notifyFollowUps: true,
    notifyTasks: true,
    notifyCampaigns: true,
    staleLeadDays: 14,
    dashboardRange: "30d",
    defaultCurrency: "USD",
  },
  email: {
    fromName: "",
    fromEmail: "",
    replyTo: "",
    signature: "",
    unsubscribeFooter: "If you would prefer not to receive further emails from us, you can unsubscribe here:",
    physicalAddress: "",
    dailyLimit: 20,
  },
};

type Json = Record<string, unknown>;

function mergeDeep<T>(base: T, patch: unknown): T {
  if (Array.isArray(base)) return (Array.isArray(patch) ? patch : base) as T;
  if (base && typeof base === "object") {
    const out: Json = { ...(base as Json) };
    if (patch && typeof patch === "object" && !Array.isArray(patch)) {
      for (const key of Object.keys(base as Json)) {
        if (key in (patch as Json)) out[key] = mergeDeep((base as Json)[key], (patch as Json)[key]);
      }
    }
    return out as T;
  }
  return (typeof patch === typeof base ? patch : base) as T;
}

export function getSettings(raw: unknown): WorkspaceSettings {
  return mergeDeep(DEFAULT_SETTINGS, raw);
}

export function splitList(text: string | null | undefined): string[] {
  return (text ?? "")
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
