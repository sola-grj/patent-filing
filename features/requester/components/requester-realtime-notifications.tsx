"use client";

import { useEffect, useRef, useState } from "react";
import { BellRing, CircleCheck, FileSignature } from "lucide-react";
import { useRouter } from "next/navigation";

import { toRequesterNotificationItem, type RequesterNotificationRow } from "@/features/requester/notifications";
import { createClient } from "@/lib/supabase/client";

type Toast = { id: string; title: string; detail: string; type: string };

export function RequesterRealtimeNotifications({ userId }: { userId: string }) {
  const router = useRouter();
  const [toast, setToast] = useState<Toast | null>(null);
  const refreshTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        .channel(`requester-notifications:${userId}`)
        .on("postgres_changes", {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`,
        }, (payload) => {
          const item = toRequesterNotificationItem(payload.new as RequesterNotificationRow);
          refresh();
          if (!item || item.readAt) return;
          setToast({ id: item.id, title: item.title, detail: item.detail, type: item.type });
        })
        .on("postgres_changes", {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`,
        }, refresh)
        .subscribe((status, error) => {
          if (status === "CHANNEL_ERROR" && error) console.error("Requester notifications Realtime error", error);
        });
    };

    void subscribe();

    return () => {
      disposed = true;
      if (refreshTimeout.current) clearTimeout(refreshTimeout.current);
      if (dismissTimeout.current) clearTimeout(dismissTimeout.current);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [router, userId]);

  useEffect(() => {
    if (!toast) return;
    dismissTimeout.current = setTimeout(() => setToast(null), 5000);
    return () => {
      if (dismissTimeout.current) clearTimeout(dismissTimeout.current);
    };
  }, [toast]);

  if (!toast) return null;
  return <div aria-live="polite" className="fixed bottom-5 right-5 z-50 flex w-[min(24rem,calc(100vw-2.5rem))] items-start gap-3 rounded-xl border bg-background p-4 shadow-lg"><span className="mt-0.5 text-brand">{toastIcon(toast.type)}</span><div className="min-w-0"><p className="text-sm font-semibold">{toast.title}</p><p className="mt-1 truncate text-sm text-muted-foreground">{toast.detail}</p></div><button type="button" onClick={() => setToast(null)} className="ml-auto text-xs text-muted-foreground hover:text-foreground">Dismiss</button></div>;
}

function toastIcon(type: string) {
  if (type === "filing_signature_required") return <FileSignature className="size-5" />;
  if (type === "quote_confirmation_required" || type === "request_completed") return <CircleCheck className="size-5" />;
  return <BellRing className="size-5" />;
}
