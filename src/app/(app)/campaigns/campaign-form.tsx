import { SubmitButton } from "@/components/submit-button";
import { DEFAULT_BODY, DEFAULT_SUBJECT } from "@/lib/outreach";
import type { campaigns } from "@/db";

type C = typeof campaigns.$inferSelect;
const d = (v?: Date | null) => (v ? v.toISOString().slice(0, 10) : "");

export function CampaignForm({ action, c }: { action: (fd: FormData) => Promise<void>; c?: C }) {
  return (
    <form action={action} className="space-y-4">
      {c && <input type="hidden" name="id" value={c.id} />}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="block md:col-span-2">
          <span className="label">Campaign name *</span>
          <input name="name" required defaultValue={c?.name} className="input" placeholder="e.g. Gulf basmati importers — Nov 2026" />
        </label>
        <label className="block md:col-span-2">
          <span className="label">Goal / description</span>
          <input name="description" defaultValue={c?.description ?? ""} className="input" />
        </label>
        <label className="block">
          <span className="label">Target industry</span>
          <input name="targetIndustry" defaultValue={c?.targetIndustry ?? ""} className="input" placeholder="Food Import" />
        </label>
        <label className="block">
          <span className="label">Target country / location</span>
          <input name="targetLocation" defaultValue={c?.targetLocation ?? ""} className="input" placeholder="United Arab Emirates" />
        </label>
        <label className="block md:col-span-2">
          <span className="label">Target job titles</span>
          <input name="targetTitles" defaultValue={c?.targetTitles ?? ""} className="input" placeholder="Procurement Manager, Purchasing Manager, Importer / Owner" />
        </label>
        <label className="block">
          <span className="label">Start date</span>
          <input type="date" name="startDate" defaultValue={d(c?.startDate)} className="input" />
        </label>
        <label className="block">
          <span className="label">End date</span>
          <input type="date" name="endDate" defaultValue={d(c?.endDate)} className="input" />
        </label>
        <label className="block">
          <span className="label">Max emails per day for this campaign</span>
          <input type="number" min={1} max={500} name="dailySendLimit" defaultValue={c?.dailySendLimit ?? 20} className="input" />
        </label>
      </div>
      <div className="grid grid-cols-1 gap-4">
        <label className="block">
          <span className="label">Email subject template</span>
          <input name="subjectTemplate" defaultValue={c?.subjectTemplate ?? DEFAULT_SUBJECT} className="input" />
        </label>
        <label className="block">
          <span className="label">Email message template</span>
          <textarea name="bodyTemplate" rows={11} defaultValue={c?.bodyTemplate ?? DEFAULT_BODY} className="input font-mono text-[13px]" />
          <span className="mt-1 block text-xs text-navy-400">Merge fields: {"{{firstName|there}}"}, {"{{lastName}}"}, {"{{company|your company}}"}, {"{{jobTitle}}"}, {"{{industry}}"}, {"{{country}}"}, {"{{senderName}}"}, {"{{senderCompany}}"}. Text after | is the fallback when a lead has no value.</span>
        </label>
      </div>
      <SubmitButton>{c ? "Save campaign" : "Create campaign"}</SubmitButton>
    </form>
  );
}
