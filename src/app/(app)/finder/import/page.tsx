import { PageHeader } from "@/components/ui";
import { CsvImporter } from "./csv-importer";

export const metadata = { title: "Import leads" };

export default function ImportPage() {
  return (
    <>
      <PageHeader title="Import leads from a CSV file" subtitle="Bring in buyers from your own spreadsheets, trade-fair contact lists, or lists you are licensed to use. Duplicates (same email, LinkedIn URL, or name + company) are skipped automatically." />
      <div className="max-w-5xl">
        <CsvImporter />
      </div>
    </>
  );
}
