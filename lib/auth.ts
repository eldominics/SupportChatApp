import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";

// Where this phone's push token is remembered (saved in Step 13), so sign-out can remove it
export const PUSH_TOKEN_KEY = "expo-push-token";

export async function signUp(
  fullName: string,
  email: string,
  password: string,
) {
  // full_name travels as user metadata; the database trigger copies it into public.users
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });
  if (error) throw error;
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut() {
  // Stop sending this account's notifications to this phone
  const token = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
  if (token) {
    await supabase
      .from("user_push_tokens")
      .delete()
      .eq("expo_push_token", token);
    await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
  }
  await supabase.auth.signOut();
}
