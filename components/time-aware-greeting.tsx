"use client";

import { useEffect, useState } from "react";

export function TimeAwareGreeting({ displayName }: { displayName: string }) {
  const [greeting, setGreeting] = useState("Hello");

  useEffect(() => {
    const updateGreeting = () => {
      setGreeting(getGreetingForHour(new Date().getHours()));
    };

    updateGreeting();
    const interval = window.setInterval(updateGreeting, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <span>
      {greeting}, {displayName}
    </span>
  );
}

export function getGreetingForHour(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
