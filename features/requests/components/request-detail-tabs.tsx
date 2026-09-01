"use client";

import type { ReactNode } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function RequestDetailTabs({
  requestOverview,
  quotation,
  signatureDocuments,
  patentInformation,
}: {
  requestOverview: ReactNode;
  quotation: ReactNode;
  signatureDocuments: ReactNode;
  patentInformation: ReactNode;
}) {
  return (
    <Tabs
      defaultValue="overview"
      className="relative min-w-0"
    >
      <TooltipProvider delayDuration={120}>
        <TabsList className="mb-4 h-auto w-fit max-w-full justify-start gap-2 overflow-x-auto rounded-2xl bg-muted/40 p-2 md:fixed md:left-6 md:top-1/2 md:z-30 md:mb-0 md:flex-col md:-translate-y-1/2 md:overflow-visible">
          <DetailTab value="overview" icon={<TabIcon src="/icons/request-tabs/request-overview.svg" />}>
            Request Overview
          </DetailTab>
          <DetailTab value="quotation" icon={<TabIcon src="/icons/request-tabs/quotation.svg" />}>
            Quotation
          </DetailTab>
          <DetailTab value="signatures" icon={<TabIcon src="/icons/request-tabs/signature-documents.svg" />}>
            Signature documents
          </DetailTab>
          <DetailTab value="patent" icon={<TabIcon src="/icons/request-tabs/patent-information.svg" />}>
            Patent Information
          </DetailTab>
        </TabsList>
      </TooltipProvider>
      <DetailTabContent value="overview">{requestOverview}</DetailTabContent>
      <DetailTabContent value="quotation">{quotation}</DetailTabContent>
      <DetailTabContent value="signatures">{signatureDocuments}</DetailTabContent>
      <DetailTabContent value="patent">{patentInformation}</DetailTabContent>
    </Tabs>
  );
}

function DetailTab({
  value,
  icon,
  children,
}: {
  value: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex shrink-0">
          <TabsTrigger
            value={value}
            className="size-12 shrink-0 rounded-full border bg-background p-0 text-muted-foreground shadow-sm hover:border-brand-border hover:text-brand data-[state=active]:border-brand data-[state=active]:bg-brand data-[state=active]:text-brand-foreground data-[state=active]:shadow-md data-[state=active]:hover:bg-brand-hover"
          >
            {icon}
            <span className="sr-only">{children}</span>
          </TabsTrigger>
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="right"
        sideOffset={10}
        className="hidden bg-black text-white md:block"
      >
        {children}
      </TooltipContent>
    </Tooltip>
  );
}

function TabIcon({ src }: { src: string }) {
  return (
    <span
      aria-hidden="true"
      className="size-6 bg-current"
      style={{
        WebkitMaskImage: `url(${src})`,
        WebkitMaskPosition: "center",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskSize: "contain",
        maskImage: `url(${src})`,
        maskPosition: "center",
        maskRepeat: "no-repeat",
        maskSize: "contain",
      }}
    />
  );
}

function DetailTabContent({
  value,
  children,
}: {
  value: string;
  children: ReactNode;
}) {
  return (
    <TabsContent
      value={value}
      className="mt-0 min-w-0"
    >
      {children}
    </TabsContent>
  );
}
