export const APP_NAME = "LinkGenius AI";
export const APP_TAGLINE = "Discover. Qualify. Connect. Convert.";

export const LEAD_STATUSES = [
  "NEW",
  "RESEARCHING",
  "QUALIFIED",
  "CONTACTED",
  "FOLLOW_UP_REQUIRED",
  "MEETING_SCHEDULED",
  "PROPOSAL_SENT",
  "NEGOTIATION",
  "CONVERTED",
  "NOT_INTERESTED",
  "DISQUALIFIED",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const STATUS_LABEL: Record<LeadStatus, string> = {
  NEW: "New",
  RESEARCHING: "Researching",
  QUALIFIED: "Qualified",
  CONTACTED: "Contacted",
  FOLLOW_UP_REQUIRED: "Follow-up Required",
  MEETING_SCHEDULED: "Meeting Scheduled",
  PROPOSAL_SENT: "Proposal Sent",
  NEGOTIATION: "Negotiation",
  CONVERTED: "Converted",
  NOT_INTERESTED: "Not Interested",
  DISQUALIFIED: "Disqualified",
};

export const STATUS_TONE: Record<LeadStatus, string> = {
  NEW: "bg-slate-100 text-slate-700",
  RESEARCHING: "bg-sky-100 text-sky-700",
  QUALIFIED: "bg-emerald-100 text-emerald-700",
  CONTACTED: "bg-blue-100 text-blue-700",
  FOLLOW_UP_REQUIRED: "bg-amber-100 text-amber-800",
  MEETING_SCHEDULED: "bg-violet-100 text-violet-700",
  PROPOSAL_SENT: "bg-indigo-100 text-indigo-700",
  NEGOTIATION: "bg-fuchsia-100 text-fuchsia-700",
  CONVERTED: "bg-green-100 text-green-800",
  NOT_INTERESTED: "bg-rose-100 text-rose-700",
  DISQUALIFIED: "bg-zinc-200 text-zinc-700",
};

/** The Kanban board is a grouped view of the 11 lead statuses (one single source of truth). */
export const PIPELINE_COLUMNS: { key: string; label: string; statuses: LeadStatus[]; dropStatus: LeadStatus }[] = [
  { key: "NEW", label: "New Leads", statuses: ["NEW", "RESEARCHING"], dropStatus: "NEW" },
  { key: "QUALIFIED", label: "Qualified", statuses: ["QUALIFIED"], dropStatus: "QUALIFIED" },
  { key: "CONTACTED", label: "Contacted", statuses: ["CONTACTED", "FOLLOW_UP_REQUIRED"], dropStatus: "CONTACTED" },
  { key: "MEETING", label: "Meeting", statuses: ["MEETING_SCHEDULED"], dropStatus: "MEETING_SCHEDULED" },
  { key: "PROPOSAL", label: "Proposal", statuses: ["PROPOSAL_SENT"], dropStatus: "PROPOSAL_SENT" },
  { key: "NEGOTIATION", label: "Negotiation", statuses: ["NEGOTIATION"], dropStatus: "NEGOTIATION" },
  { key: "CONVERTED", label: "Converted", statuses: ["CONVERTED"], dropStatus: "CONVERTED" },
  { key: "LOST", label: "Lost", statuses: ["NOT_INTERESTED", "DISQUALIFIED"], dropStatus: "NOT_INTERESTED" },
];

export const CONTACTED_OR_LATER: LeadStatus[] = [
  "CONTACTED",
  "FOLLOW_UP_REQUIRED",
  "MEETING_SCHEDULED",
  "PROPOSAL_SENT",
  "NEGOTIATION",
  "CONVERTED",
];

export const VERIFICATION_LABEL = {
  VERIFIED: "Verified",
  PARTIALLY_VERIFIED: "Partially Verified",
  UNVERIFIED: "Unverified",
  OUTDATED: "Outdated",
} as const;
export const VERIFICATION_TONE = {
  VERIFIED: "bg-emerald-100 text-emerald-700",
  PARTIALLY_VERIFIED: "bg-amber-100 text-amber-800",
  UNVERIFIED: "bg-slate-100 text-slate-600",
  OUTDATED: "bg-rose-100 text-rose-700",
} as const;

export const PRIORITY_TONE = {
  LOW: "bg-slate-100 text-slate-600",
  MEDIUM: "bg-sky-100 text-sky-700",
  HIGH: "bg-amber-100 text-amber-800",
  URGENT: "bg-rose-100 text-rose-700",
} as const;

export const INDUSTRIES = [
  "Food Import & Distribution",
  "Rice & Grain Trading",
  "Spices & Condiments",
  "Agriculture & Commodities",
  "Export & Trading",
  "Wholesale & Retail",
  "Supermarkets & Grocery",
  "FMCG & Packaged Foods",
  "Food Processing",
  "Hospitality & Catering",
  "Software & SaaS",
  "Manufacturing",
  "Marketing & Advertising",
  "Financial Services",
  "Education",
  "Healthcare",
  "Logistics & Shipping",
  "Other",
];

export const COUNTRIES = [
  "India",
  "United Arab Emirates",
  "Saudi Arabia",
  "Qatar",
  "Kuwait",
  "Oman",
  "Bahrain",
  "United States",
  "Canada",
  "United Kingdom",
  "Germany",
  "France",
  "Netherlands",
  "Italy",
  "Spain",
  "Belgium",
  "Australia",
  "New Zealand",
  "Singapore",
  "Malaysia",
  "Indonesia",
  "Bangladesh",
  "Sri Lanka",
  "Nepal",
  "Pakistan",
  "South Africa",
  "Kenya",
  "Nigeria",
  "Ghana",
  "Egypt",
  "Morocco",
  "Turkey",
  "Iraq",
  "Jordan",
  "Yemen",
  "Japan",
  "South Korea",
  "China",
  "Hong Kong",
  "Brazil",
  "Mexico",
  "Other",
];

export const COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"];
export const SENIORITY = ["Owner / Founder", "C-Level", "Director", "Head / VP", "Manager", "Executive", "Other"];
export const DEPARTMENTS = ["Procurement", "Purchasing", "Sourcing", "Operations", "Sales", "Marketing", "Management", "Finance", "Other"];
export const BUSINESS_TYPES = ["Importer", "Wholesaler", "Distributor", "Retailer / Supermarket", "Food Manufacturer", "Restaurant / Caterer", "Trader / Broker", "Other"];
export const TARGET_TITLES = [
  "Founder",
  "CEO",
  "Managing Director",
  "Business Development Manager",
  "Marketing Manager",
  "Sales Director",
  "HR Manager",
  "Procurement Manager",
  "Purchasing Manager",
  "Operations Manager",
  "Importer / Owner",
];

export const ACTIVITY_LABEL: Record<string, string> = {
  CREATED: "Lead created",
  STATUS_CHANGE: "Status changed",
  NOTE: "Note added",
  SCORE: "Score updated",
  ENRICHED: "Enriched",
  EMAIL: "Email",
  TASK: "Task",
  ASSIGNED: "Assigned",
  UPDATED: "Updated",
  VERIFIED: "Verification",
};
