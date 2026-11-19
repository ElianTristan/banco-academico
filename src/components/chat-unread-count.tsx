"use client";

import { useEffect, useState } from "react";
import { getUnreadChatCount } from "@/app/academic/actions";

export function ChatUnreadCount({ initialCount }: { initialCount: number }) {
  const [count, setCount] = useState(initialCount);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const nextCount = await getUnreadChatCount();
      if (active) setCount(nextCount);
    };
    const timer = window.setInterval(() => void refresh(), 12000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  if (count <= 0) return null;
  return <span className="chat-unread-badge" aria-label={`${count} mensajes sin leer`}>{count > 99 ? "99+" : count}</span>;
}
