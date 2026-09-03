import { FreshRequestWizard } from "@/features/requester/components/fresh-request-wizard";

export default function NewRequesterRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ fresh?: string; q?: string; path?: string; step?: string }>;
}) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <FreshRequestWizard searchParams={searchParams} />
    </div>
  );
}
