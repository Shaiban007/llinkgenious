import Link from "next/link";
import { Card, CardHeader, PageHeader } from "@/components/ui";

export const metadata = { title: "Help" };

const STEPS: [string, string, string, string][] = [
  ["1", "Describe your ideal buyer", "Settings → Scoring", "Tell LinkGenius which industries, countries, job titles and company sizes you want. Every lead is scored 0–100 against this."],
  ["2", "Connect your email", "Integrations", "Add your SMTP details (for Gmail use an App Password) and your postal address in Settings → Email. Emails cannot be sent until both are set."],
  ["3", "Bring in real leads", "Lead Finder → Import", "Upload a CSV from a trade fair list, a directory, a customs-data export or your own spreadsheet. Nothing is invented: only what is in your file is saved."],
  ["4", "Review and add to the CRM", "Lead Finder", "Look at the scores, tick the good ones and choose “Add to CRM”. Only CRM leads count in dashboards and KPIs."],
  ["5", "Draft emails", "Campaigns or Email Outbox", "Write one template with {{first_name}} and {{company}} placeholders. LinkGenius makes one draft per lead. You read, edit, approve and only then send."],
  ["6", "Follow up", "Tasks & Follow-ups, Pipeline", "Move leads along the pipeline as conversations progress. Reminders appear in Notifications when a follow-up is due."],
];

const FAQ: [string, string][] = [
  ["Why can’t I find any leads automatically?", "LinkGenius does not scrape websites or LinkedIn and is not connected to a paid lead database, so it never makes up contacts. You find buyers from the sources listed below, then import them and let LinkGenius score, organise and follow them up."],
  ["How is the score worked out?", "It is a rule-based estimate out of 100: industry, job title, company size, country, how complete the contact details are, whether the data is verified, and interest in your products. Missing information is never counted as a match. Open any lead to see the exact reasons. It is guidance, not a prediction."],
  ["Will emails ever send by themselves?", "No. Every email starts as a draft. A person must approve it. Sending also needs your SMTP account, your postal address, respects daily limits, skips unsubscribed people and adds an unsubscribe link automatically."],
  ["What does “Add to CRM” do?", "Leads found or imported sit in the Lead Finder first. Adding them to the CRM puts them in the pipeline, dashboards and KPIs. This keeps your numbers honest."],
  ["Why is the AI Assistant disabled?", "It uses your own Anthropic API key (Integrations). Without a key it stays off rather than pretending. It reads your data and writes drafts only; it cannot send mail."],
  ["Who can see my data?", "Only people you invite to your workspace. Every query is limited to your workspace. The platform admin panel shows counts and logs, not lead contents."],
  ["Is cold emailing allowed?", "Rules differ by country. In the US (CAN-SPAM) you need an honest subject, your postal address and a working unsubscribe. The EU/UK are stricter for individuals (GDPR/PECR) but business-to-business emails to company addresses are treated more leniently in some cases. India’s DPDP Act also applies to personal data. LinkGenius adds the basics, but check the rules for the countries you target. This is not legal advice."],
];

const SOURCES: [string, string][] = [
  ["ITC Trade Map (trademap.org)", "Shows which countries import rice or turmeric (HS 1006 for rice, 091030 for turmeric), how much, and from whom. Use it to choose target countries."],
  ["UN Comtrade (comtradeplus.un.org)", "Free official trade statistics by product and country. Good for confirming demand before you spend time."],
  ["APEDA (apeda.gov.in)", "India’s agri-export body. Rice exporters register and get an RCMC here. It also runs buyer-seller meets and shares importer information with registered members."],
  ["Spices Board India (indianspices.com)", "The regulator and promoter for turmeric and other spices. Registration, trade enquiries and fair participation."],
  ["Trade fairs: Gulfood (Dubai), SIAL (Paris), Anuga (Cologne), Biofach (organic)", "Exhibitor and visitor lists, and the meetings themselves, are where real buyers are. Collect business cards, then import them as a CSV."],
  ["Your own enquiries and Indian embassy trade desks", "Commercial wings of Indian embassies abroad forward buyer enquiries. Keep every enquiry as a lead, with the source recorded."],
];

export default function HelpPage() {
  return (
    <>
      <PageHeader title="Help" subtitle="A short guide for getting from zero to your first approved email." />
      <Card>
        <CardHeader title="Your first week, step by step" />
        <ol className="divide-y divide-navy-100">
          {STEPS.map(([n, title, where, text]) => (
            <li key={n} className="flex gap-4 p-5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">{n}</span>
              <div>
                <p className="font-semibold text-navy-900">{title} <span className="ml-1 text-xs font-normal text-navy-400">{where}</span></p>
                <p className="mt-1 text-sm text-navy-600">{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <Card className="mt-6">
        <CardHeader title="Where to find real rice and turmeric buyers" subtitle="These are public, legitimate sources. Always verify a buyer (company registration, references, trade history) before shipping." />
        <ul className="divide-y divide-navy-100">
          {SOURCES.map(([t, d]) => (
            <li key={t} className="p-5"><p className="font-semibold text-navy-900">{t}</p><p className="mt-1 text-sm text-navy-600">{d}</p></li>
          ))}
        </ul>
        <p className="border-t border-navy-100 p-5 text-sm text-navy-600">Be careful with buyers who ask you to pay fees up front or use unusual payment routes. Prefer secure terms such as a letter of credit or advance payment from the buyer, and talk to your bank and ECGC before large shipments.</p>
      </Card>

      <Card className="mt-6">
        <CardHeader title="Questions" />
        <div className="divide-y divide-navy-100">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group p-5">
              <summary className="cursor-pointer list-none font-semibold text-navy-900 marker:hidden">{q}</summary>
              <p className="mt-2 text-sm leading-relaxed text-navy-600">{a}</p>
            </details>
          ))}
        </div>
      </Card>

      <p className="mt-6 text-sm text-navy-500">Need to change how leads are scored? <Link href="/settings" className="font-semibold text-brand-600 hover:underline">Open Settings</Link>.</p>
    </>
  );
}
