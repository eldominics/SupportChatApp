import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";
import { PUSH_TOKEN_KEY } from "../lib/auth";
import { supabase } from "../lib/supabase";

// Show notifications as banners even while the app is open
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function getExpoPushToken(): Promise<string | null> {
  // Simulators can't receive push notifications
  if (!Device.isDevice) {
    console.log("Push notifications need a physical device");
    return null;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let status = existingStatus;
  if (existingStatus !== "granted") {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== "granted") return null;

  // The EAS project ID is added to app.json by `eas init`
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId) {
    console.error("No EAS projectId found. Run `eas init` first.");
    return null;
  }

  const { data: token } = await Notifications.getExpoPushTokenAsync({
    projectId,
  });
  return token;
}

export function usePushNotifications(userId?: string) {
  const router = useRouter();

  useEffect(() => {
    if (!userId) return;

    // 1. Get this phone's Expo push token and save it for the signed-in user
    getExpoPushToken().then(async (token) => {
      if (!token) return;
      const { error } = await supabase.rpc("save_push_token", {
        p_token: token,
        p_platform: Platform.OS,
      });
      if (error)
        return console.error("Saving push token failed:", error.message);
      await AsyncStorage.setItem(PUSH_TOKEN_KEY, token); // lets signOut() remove it later
      console.log("Push token saved:", token);
    });

    // 2. Open the screen named in the notification's data when it's tapped
    const openRoute = (response: Notifications.NotificationResponse) => {
      const route = response.notification.request.content.data?.route;
      if (typeof route === "string") router.push(route as never);
    };

    // The app was opened by tapping a notification
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) openRoute(response);
    });

    // A notification was tapped while the app was running
    const subscription =
      Notifications.addNotificationResponseReceivedListener(openRoute);
    return () => subscription.remove();
  }, [userId, router]);
}
