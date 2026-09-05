import AsyncStorage from "@react-native-async-storage/async-storage";

export const TOUR_COMPLETED_KEY = "mac_remote_mobile_tour_completed";

export async function getTourCompleted(): Promise<boolean> {
  const completed = await AsyncStorage.getItem(TOUR_COMPLETED_KEY);

  return completed === "true";
}

export async function setTourCompleted(): Promise<void> {
  await AsyncStorage.setItem(TOUR_COMPLETED_KEY, "true");
}
