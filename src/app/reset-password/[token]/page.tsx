import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { ResetForm } from "./reset-form";

export const metadata = { title: "Choose a new password" };

export default function ResetPage({ params }: { params: { token: string } }) {
  return (
    <AuthShell
      title="Choose a new password"
      footer={
        <Link href="/login" className="font-semibold text-brand-600 hover:underline">
          Back to log in
        </Link>
      }
    >
      <ResetForm token={params.token} />
    </AuthShell>
  );
}
