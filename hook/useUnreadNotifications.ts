import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

// Number of unread notifications, kept live with Realtime
export function useUnreadNotifications(userId?: string) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const { count: unread } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_read", false);
    setCount(unread ?? 0);
  }, [userId]);

  // Re-count when the screen comes back into view (e.g. after reading notifications)
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  // Re-count whenever a notification is added or marked read
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`unread-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, refresh]);

  return count;
}
