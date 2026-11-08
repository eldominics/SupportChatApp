import type { Enums, Tables } from "./supabase";

export type UserProfile = Tables<"users">;
export type SupportSession = Tables<"support_sessions">;
export type SupportMessage = Tables<"support_messages">;
export type AppNotification = Tables<"notifications">;

export type SessionStatus = Enums<"session_status">;
export type MessageRole = Enums<"message_role">;
