import type { Lead } from "@/db";
import { COMPANY_SIZES, COUNTRIES, DEPARTMENTS, INDUSTRIES, SENIORITY, TARGET_TITLES } from "@/lib/constants";
import { SubmitButton } from "./submit-button";

/** Shared by "Add lead" and "Edit lead". Plain server-rendered form — works without any JavaScript. */
export function LeadForm({
  action,
  lead,
  members,
  currentUserId,
  cancelHref,
  defaultPool,
}: {
  action: (fd: FormData) => Promise<void>;
  lead?: Lead;
  members?: { id: string; name: string }[];
  currentUserId?: string;
  cancelHref: string;
  defaultPool?: boolean;
}) {
  const v = (k: keyof Lead) => (lead?.[k] as string | null | undefined) ?? "";
  return (
    <form action={action} className="space-y-6">
      {lead && <input type="hidden" name="id" value={lead.id} />}
      <datalist id="dl-industry">
        {INDUSTRIES.map((i) => (
          <option key={i} value={i} />
        ))}
      </datalist>
      <datalist id="dl-country">
        {COUNTRIES.map((i) => (
          <option key={i} value={i} />
        ))}
      </datalist>
      <datalist id="dl-title">
        {TARGET_TITLES.map((i) => (
          <option key={i} value={i} />
        ))}
      </datalist>

      <Section title="Person">
        <F label="Full name *">
          <input name="fullName" required minLength={2} defaultValue={v("fullName")} className="input" autoComplete="off" />
        </F>
        <F label="Job title">
          <input name="jobTitle" list="dl-title" defaultValue={v("jobTitle")} className="input" placeholder="e.g. Procurement Manager" />
        </F>
        <F label="Seniority">
          <select name="seniority" defaultValue={v("seniority")} className="input">
            <option value="">—</option>
            {SENIORITY.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </F>
        <F label="Department">
          <select name="department" defaultValue={v("department")} className="input">
            <option value="">—</option>
            {DEPARTMENTS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </F>
        <F label="Email">
          <input name="email" type="email" defaultValue={v("email")} className="input" />
        </F>
        <F label="Phone / WhatsApp">
          <input name="phone" defaultValue={v("phone")} className="input" placeholder="+971 …" />
        </F>
        <F label="LinkedIn profile URL" hint="Paste the link yourself. LinkGenius never scrapes LinkedIn.">
          <input name="linkedinUrl" defaultValue={v("linkedinUrl")} className="input" placeholder="https://linkedin.com/in/…" />
        </F>
      </Section>

      <Section title="Company">
        <F label="Company name">
          <input name="companyName" defaultValue={v("companyName")} className="input" />
        </F>
        <F label="Company website">
          <input name="companyWebsite" defaultValue={v("companyWebsite")} className="input" placeholder="https://…" />
        </F>
        <F label="Industry">
          <input name="industry" list="dl-industry" defaultValue={v("industry")} className="input" />
        </F>
        <F label="Company size (employees)">
          <select name="companySize" defaultValue={v("companySize")} className="input">
            <option value="">—</option>
            {COMPANY_SIZES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </F>
        <F label="Country">
          <input name="country" list="dl-country" defaultValue={v("country")} className="input" />
        </F>
        <F label="City / location">
          <input name="location" defaultValue={v("location")} className="input" />
        </F>
        <F label="What do they buy?" hint="Products or interests, e.g. “basmati rice, turmeric”.">
          <input name="interests" defaultValue={v("interests")} className="input" />
        </F>
      </Section>

      <Section title="Deal & ownership">
        <F label="Where did you find this lead?">
          <input name="sourceLabel" defaultValue={v("sourceLabel")} className="input" placeholder="e.g. Gulfood 2026, referral, website enquiry" />
        </F>
        <F label="Estimated deal value">
          <input name="dealValue" inputMode="decimal" defaultValue={v("dealValue")} className="input" placeholder="e.g. 25000" />
        </F>
        <F label="Currency">
          <input name="dealCurrency" maxLength={5} defaultValue={v("dealCurrency") || "USD"} className="input" />
        </F>
        {!lead && (
          <F label="Save to" hint="“Lead Finder” keeps it out of your reports until you decide to add it to the CRM.">
            <select name="saveTo" defaultValue={defaultPool ? "pool" : "crm"} className="input">
              <option value="crm">CRM — start working on it now</option>
              <option value="pool">Lead Finder — review later</option>
            </select>
          </F>
        )}
        {!lead && members && (
          <F label="Assign to">
            <select name="assignedTo" defaultValue={currentUserId} className="input">
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </F>
        )}
      </Section>

      {!lead && (
        <label className="flex items-start gap-2 text-sm text-navy-600">
          <input type="checkbox" name="allowDuplicate" className="mt-0.5 h-4 w-4 rounded border-navy-300" />
          Create even if it looks like a duplicate (we check email, LinkedIn URL, and name + company)
        </label>
      )}

      <div className="flex gap-2">
        <SubmitButton pendingText="Saving…">{lead ? "Save changes" : "Create lead"}</SubmitButton>
        <a href={cancelHref} className="btn-secondary">
          Cancel
        </a>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="card p-5">
      <legend className="px-1 text-sm font-semibold text-navy-900">{title}</legend>
      <div className="mt-2 grid grid-cols-1 gap-4 md:grid-cols-2">{children}</div>
    </fieldset>
  );
}
function F({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-navy-400">{hint}</span>}
    </label>
  );
}
