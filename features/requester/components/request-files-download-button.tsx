import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function RequestFilesDownloadButton({ href }: { href: string }) {
  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button asChild variant="ghost" size="icon" className="h-8 w-8">
            <a href={href} aria-label="Download uploaded files">
              <Download className="size-4" />
            </a>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Download uploaded files</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
