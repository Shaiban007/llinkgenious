/**
 * Lead scoring engine. Pure functions — no database access — so the rules are easy to test.
 *
 * Rule of thumb: MISSING information is never a positive match. If a lead has no industry,
 * the industry criterion scores 0 and the reason says "not provided".
 */
import type { ScoringConfig } from "./workspace-settings";

export type ScorableLead = {
  jobTitle?: string | null;
  industry?: string | null;
  companyName?: string | null;
  companySize?: string | null;
  companyWebsite?: string | null;
  country?: string | null;
  location?: string | null;
  interests?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedinUrl?: string | null;
  verifiedAt?: Date | null;
};

export type CriterionResult = {
  key: string;
  label: string;
  points: number;
  max: number;
  reason: string;
  matched: boolean | null; // null = information missing
};

export type ScoreResult = {
  total: number;
  category: ScoreCategory;
  breakdown: CriterionResult[];
};

export type ScoreCategory = "High Priority" | "Good Prospect" | "Medium Priority" | "Low Priority";

export function categoryFor(score: number, t: ScoringConfig["thresholds"]): ScoreCategory {
  if (score >= t.high) return "High Priority";
  if (score >= t.good) return "Good Prospect";
  if (score >= t.medium) return "Medium Priority";
  return "Low Priority";
}

export const CATEGORY_TONE: Record<ScoreCategory, string> = {
  "High Priority": "bg-emerald-100 text-emerald-700",
  "Good Prospect": "bg-blue-100 text-blue-700",
  "Medium Priority": "bg-amber-100 text-amber-800",
  "Low Priority": "bg-slate-100 text-slate-600",
};

const norm = (s?: string | null) => (s ?? "").toLowerCase().trim();
const present = (s?: string | null) => norm(s).length > 0;
const findMatches = (text: string, keywords: string[]) =>
  keywords.filter((k) => k.trim() && text.includes(k.toLowerCase().trim()));

/** "11-50" → [11, 50], "1000+" → [1000, Infinity], "50" → [50, 50] */
export function parseSizeRange(size?: string | null): [number, number] | null {
  const s = norm(size).replace(/[, ]/g, "");
  if (!s) return null;
  let m = s.match(/^(\d+)-(\d+)$/);
  if (m) return [Number(m[1]), Number(m[2])];
  m = s.match(/^(\d+)\+$/);
  if (m) return [Number(m[1]), Infinity];
  m = s.match(/^(\d+)$/);
  if (m) return [Number(m[1]), Number(m[1])];
  return null;
}

function sizesOverlap(a: [number, number], b: [number, number]) {
  return a[0] <= b[1] && b[0] <= a[1];
}

export function scoreLead(lead: ScorableLead, config: ScoringConfig, now = new Date()): ScoreResult {
  const w = config.weights;
  const icp = config.icp;
  const breakdown: CriterionResult[] = [];

  // 1. Industry match
  {
    const text = norm(lead.industry);
    if (!text) {
      breakdown.push({ key: "industry", label: "Industry match", points: 0, max: w.industry, matched: null, reason: "Industry not provided — not counted as a match." });
    } else {
      const hits = findMatches(text, icp.industries);
      breakdown.push(
        hits.length
          ? { key: "industry", label: "Industry match", points: w.industry, max: w.industry, matched: true, reason: `Industry "${lead.industry}" matches your target (${hits.slice(0, 3).join(", ")}).` }
          : { key: "industry", label: "Industry match", points: 0, max: w.industry, matched: false, reason: `Industry "${lead.industry}" is outside your target industries.` }
      );
    }
  }

  // 2. Job designation match
  {
    const title = norm(lead.jobTitle);
    if (!title) {
      breakdown.push({ key: "designation", label: "Job designation", points: 0, max: w.designation, matched: null, reason: "Job title not provided — not counted as a match." });
    } else {
      const hits = findMatches(title, icp.titles);
      const senior = /(owner|founder|director|ceo|chief|president|chairman|proprietor|partner|head|vp)/.test(title);
      if (hits.length) {
        breakdown.push({ key: "designation", label: "Job designation", points: w.designation, max: w.designation, matched: true, reason: `Title "${lead.jobTitle}" matches a target decision-maker role.` });
      } else if (senior) {
        breakdown.push({ key: "designation", label: "Job designation", points: Math.round(w.designation / 2), max: w.designation, matched: true, reason: `Title "${lead.jobTitle}" is senior but not one of your target roles (half points).` });
      } else {
        breakdown.push({ key: "designation", label: "Job designation", points: 0, max: w.designation, matched: false, reason: `Title "${lead.jobTitle}" is not a target decision-maker role.` });
      }
    }
  }

  // 3. Company size match
  {
    const range = parseSizeRange(lead.companySize);
    const preferred = icp.sizes.map(parseSizeRange).filter((r): r is [number, number] => r !== null);
    if (!range) {
      breakdown.push({ key: "companySize", label: "Company size", points: 0, max: w.companySize, matched: null, reason: "Company size not provided — not counted as a match." });
    } else if (!preferred.length) {
      breakdown.push({ key: "companySize", label: "Company size", points: 0, max: w.companySize, matched: null, reason: "No preferred company size set in Settings." });
    } else if (preferred.some((p) => sizesOverlap(range, p))) {
      breakdown.push({ key: "companySize", label: "Company size", points: w.companySize, max: w.companySize, matched: true, reason: `Company size ${lead.companySize} fits your preferred range.` });
    } else {
      breakdown.push({ key: "companySize", label: "Company size", points: 0, max: w.companySize, matched: false, reason: `Company size ${lead.companySize} is outside your preferred range.` });
    }
  }

  // 4. Location match
  {
    const text = `${norm(lead.country)} | ${norm(lead.location)}`;
    if (!present(lead.country) && !present(lead.location)) {
      breakdown.push({ key: "location", label: "Location", points: 0, max: w.location, matched: null, reason: "Location not provided — not counted as a match." });
    } else {
      const hits = findMatches(text, icp.locations);
      breakdown.push(
        hits.length
          ? { key: "location", label: "Location", points: w.location, max: w.location, matched: true, reason: `Location matches your target market (${hits[0]}).` }
          : { key: "location", label: "Location", points: 0, max: w.location, matched: false, reason: "Location is outside your target markets." }
      );
    }
  }

  // 5. Ideal customer profile match (keywords across company, industry, interests, website)
  {
    const text = [lead.companyName, lead.industry, lead.interests, lead.companyWebsite].map(norm).join(" | ");
    if (!text.replace(/[| ]/g, "")) {
      breakdown.push({ key: "icp", label: "Ideal customer fit", points: 0, max: w.icp, matched: null, reason: "No company details to compare with your ideal customer profile." });
    } else {
      const hits = findMatches(text, icp.keywords);
      const pts = Math.min(w.icp, Math.round((hits.length / 2) * w.icp));
      breakdown.push({
        key: "icp",
        label: "Ideal customer fit",
        points: pts,
        max: w.icp,
        matched: hits.length > 0,
        reason: hits.length ? `Company details mention ${hits.slice(0, 4).join(", ")}.` : "Company details do not mention any of your ideal customer keywords.",
      });
    }
  }

  // 6. Available business information (completeness)
  {
    const fields: [string, boolean][] = [
      ["email", present(lead.email)],
      ["phone", present(lead.phone)],
      ["LinkedIn", present(lead.linkedinUrl)],
      ["website", present(lead.companyWebsite)],
      ["job title", present(lead.jobTitle)],
      ["company", present(lead.companyName)],
      ["location", present(lead.country) || present(lead.location)],
    ];
    const have = fields.filter(([, ok]) => ok).length;
    const missing = fields.filter(([, ok]) => !ok).map(([n]) => n);
    const pts = Math.round((have / fields.length) * w.information);
    breakdown.push({
      key: "information",
      label: "Available information",
      points: pts,
      max: w.information,
      matched: have === fields.length ? true : have === 0 ? false : null,
      reason: missing.length ? `${have} of ${fields.length} key fields present. Missing: ${missing.join(", ")}.` : "All key contact and company fields are present.",
    });
  }

  // 7. Data freshness (only verified data counts as fresh)
  {
    if (!lead.verifiedAt) {
      breakdown.push({ key: "freshness", label: "Data freshness", points: 0, max: w.freshness, matched: null, reason: "Never verified — freshness cannot be confirmed." });
    } else {
      const ageDays = (now.getTime() - lead.verifiedAt.getTime()) / 86400000;
      if (ageDays <= config.freshnessDays) {
        breakdown.push({ key: "freshness", label: "Data freshness", points: w.freshness, max: w.freshness, matched: true, reason: `Verified ${Math.round(ageDays)} day(s) ago.` });
      } else if (ageDays <= config.freshnessDays * 2) {
        breakdown.push({ key: "freshness", label: "Data freshness", points: Math.round(w.freshness / 2), max: w.freshness, matched: null, reason: `Verification is ${Math.round(ageDays)} days old — getting stale.` });
      } else {
        breakdown.push({ key: "freshness", label: "Data freshness", points: 0, max: w.freshness, matched: false, reason: `Verification is ${Math.round(ageDays)} days old — outdated.` });
      }
    }
  }

  const total = Math.max(0, Math.min(100, breakdown.reduce((s, c) => s + c.points, 0)));
  return { total, category: categoryFor(total, config.thresholds), breakdown };
}

export function explainScore(result: ScoreResult): string {
  const lines = result.breakdown.map((c) => `• ${c.label}: ${c.points}/${c.max} — ${c.reason}`);
  return `Lead score: ${result.total}/100 (${result.category})\n${lines.join("\n")}`;
}
