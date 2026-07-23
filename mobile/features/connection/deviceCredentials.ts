import * as SecureStore from "expo-secure-store";
import { hashToken } from "../security/tokenProof";

// Trusted-device tokens are secrets, so they live in the OS keychain/keystore
// via SecureStore rather than the plaintext AsyncStorage device metadata.
const DEVICE_TOKEN_KEY_PREFIX = "remotecontrol.devicetoken.";

const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

// SecureStore keys only allow [A-Za-z0-9._-], but device ids are hosts that can
// contain ports and other characters. Hashing yields a stable, valid key.
function getCredentialKey(deviceId: string): string {
  return `${DEVICE_TOKEN_KEY_PREFIX}${hashToken(deviceId)}`;
}

export async function readDeviceToken(
  deviceId: string,
): Promise<string | undefined> {
  const cleanId = deviceId.trim();

  if (!cleanId) {
    return undefined;
  }

  try {
    const value = await SecureStore.getItemAsync(
      getCredentialKey(cleanId),
      SECURE_STORE_OPTIONS,
    );

    return value ?? undefined;
  } catch {
    return undefined;
  }
}

// Returns true only when the token is durably stored in SecureStore. Callers
// rely on this to decide whether it is safe to drop the AsyncStorage fallback,
// so a failed write must never report success.
export async function writeDeviceToken(
  deviceId: string,
  token: string,
): Promise<boolean> {
  const cleanId = deviceId.trim();
  const cleanToken = token.trim();

  if (!cleanId || !cleanToken) {
    return false;
  }

  try {
    await SecureStore.setItemAsync(
      getCredentialKey(cleanId),
      cleanToken,
      SECURE_STORE_OPTIONS,
    );

    return true;
  } catch {
    return false;
  }
}

export async function removeDeviceToken(deviceId: string): Promise<void> {
  const cleanId = deviceId.trim();

  if (!cleanId) {
    return;
  }

  try {
    await SecureStore.deleteItemAsync(
      getCredentialKey(cleanId),
      SECURE_STORE_OPTIONS,
    );
  } catch {
    // Ignore storage errors.
  }
}
