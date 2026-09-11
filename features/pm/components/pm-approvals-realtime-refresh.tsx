"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export function PmApprovalsRealtimeRefresh({ userId }: { userId: string }) {
  const router = useRouter();
  const refreshTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let disposed = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const refresh = () => {
      if (refreshTimeout.current) return;
      refreshTimeout.current = setTimeout(() => {
        refreshTimeout.current = null;
        router.refresh();
      }, 150);
    };
    const subscribe = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (disposed || !session || session.user.id !== userId) return;

      await supabase.realtime.setAuth();
      channel = supabase
        .channel(`pm-approvals:${userId}`)
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table: "approval_requests",
        }, refresh)
        .subscribe((status, error) => {
          if (status === "CHANNEL_ERROR" && error) {
            console.error("PM approvals Realtime error", error);
          }
        });
    };

    void subscribe();
    return () => {
      disposed = true;
      if (refreshTimeout.current) clearTimeout(refreshTimeout.current);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [router, userId]);

  return null;
}
