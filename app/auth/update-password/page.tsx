import { UpdatePasswordForm } from "@/components/update-password-form";
import { Suspense } from "react";

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <UpdatePasswordContent searchParams={searchParams} />
    </Suspense>
  );
}

async function UpdatePasswordContent({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const nextPath = next?.startsWith("/") && !next.startsWith("//") ? next : "/";
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <UpdatePasswordForm nextPath={nextPath} />
      </div>
    </div>
  );
}
