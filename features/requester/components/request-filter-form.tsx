"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { requestStatusOptions } from "@/features/requester/options";

export function RequestFilterForm({
  status,
  query,
}: {
  status?: string;
  query?: string;
}) {
  return (
    <form className="flex flex-col gap-3 rounded-md border p-4 md:flex-row">
      <Input
        name="q"
        defaultValue={query}
        placeholder="Search request number or patent number"
      />
      <Select name="status" defaultValue={status ?? "all"}>
        <SelectTrigger className="md:w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {requestStatusOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="submit" variant="outline">Filter</Button>
    </form>
  );
}
