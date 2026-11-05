import { createCampaignAction } from "@/app/actions/campaigns";
import { PageHeader } from "@/components/ui";
import { CampaignForm } from "../campaign-form";

export const metadata = { title: "New campaign" };

export default function NewCampaignPage() {
  return (
    <>
      <PageHeader title="New campaign" subtitle="A campaign groups leads and one email template. It writes drafts — you approve every email before it is sent." />
      <div className="card max-w-4xl p-5">
        <CampaignForm action={createCampaignAction} />
      </div>
    </>
  );
}
