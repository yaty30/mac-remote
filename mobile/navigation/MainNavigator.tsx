import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { RemoteScreen } from "../screens/RemoteScreen";
import {
  ROUTES,
  type MainStackParamList,
} from "./navigationTypes";

const Stack = createNativeStackNavigator<MainStackParamList>();

export function MainNavigator() {
  return (
    <Stack.Navigator
      initialRouteName={ROUTES.main.remote}
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen
        name={ROUTES.main.remote}
        options={{ gestureEnabled: false }}
      >
        {() => <RemoteScreen showInitialSplash={false} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
