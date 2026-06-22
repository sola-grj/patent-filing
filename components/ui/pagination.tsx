import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

import { Button, buttonVariants } from "./button";

type PaginationNavProps = {
  currentPage: number;
  totalPages: number;
  buildHref: (page: number) => string;
  className?: string;
};

export function PaginationNav({
  currentPage,
  totalPages,
  buildHref,
  className,
}: PaginationNavProps) {
  if (totalPages <= 1) {
    return null;
  }

  const pages = buildPageWindow(currentPage, totalPages);
  const previousPage = Math.max(1, currentPage - 1);
  const nextPage = Math.min(totalPages, currentPage + 1);

  return (
    <nav
      aria-label="Pagination"
      className={cn("flex items-center justify-between", className)}
    >
      <Button asChild variant="outline" disabled={currentPage <= 1}>
        <Link href={buildHref(previousPage)} aria-disabled={currentPage <= 1}>
          <ChevronLeft className="size-4" />
          <span>Previous page</span>
        </Link>
      </Button>
      <div className="flex items-center gap-2">
        {pages.map((pageNumber) => (
          <Link
            key={pageNumber}
            href={buildHref(pageNumber)}
            aria-current={pageNumber === currentPage ? "page" : undefined}
            className={cn(
              buttonVariants({
                variant: pageNumber === currentPage ? "default" : "outline",
                size: "sm",
              }),
              "min-w-9 px-3",
            )}
          >
            {pageNumber}
          </Link>
        ))}
      </div>
      <Button asChild variant="outline" disabled={currentPage >= totalPages}>
        <Link href={buildHref(nextPage)} aria-disabled={currentPage >= totalPages}>
          <span>Next page</span>
          <ChevronRight className="size-4" />
        </Link>
      </Button>
    </nav>
  );
}

function buildPageWindow(currentPage: number, totalPages: number) {
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, start + 4);
  const adjustedStart = Math.max(1, end - 4);

  return Array.from(
    { length: end - adjustedStart + 1 },
    (_, index) => adjustedStart + index,
  );
}
