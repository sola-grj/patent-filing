import Link from "next/link";

export default function PmLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="grid min-h-dvh grid-rows-[auto_1fr] bg-background">
      <div className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 text-sm">
          <Link href="/pm" className="font-semibold tracking-tight">
            Patentia
          </Link>
          <div className="flex items-center gap-5">
            <Link href="/pm/requests" className="text-muted-foreground hover:text-foreground">
              Requests
            </Link>
            <Link href="/requester" className="text-muted-foreground hover:text-foreground">
              Requester portal
            </Link>
          </div>
        </nav>
      </div>
      <div className="mx-auto w-full max-w-7xl px-6 py-8">{children}</div>
    </main>
  );
}
