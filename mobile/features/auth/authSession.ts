import * as SecureStore from "expo-secure-store";

const AUTH_SESSION_STORAGE_KEY = "mac_remote_mobile_auth_session";
const AUTH_SESSION_VERSION = 1;

export type AuthMethod = "apple" | "google" | "password" | "signUp";

export interface AuthSession {
  createdAt: string;
  email?: string;
  method: AuthMethod;
  token: string;
  version: typeof AUTH_SESSION_VERSION;
}

export interface AuthSignInInput {
  email?: string;
  method: AuthMethod;
}

const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export async function restoreAuthSession(): Promise<AuthSession | null> {
  const isAvailable = await SecureStore.isAvailableAsync();

  if (!isAvailable) {
    return null;
  }

  const rawSession = await SecureStore.getItemAsync(
    AUTH_SESSION_STORAGE_KEY,
    SECURE_STORE_OPTIONS,
  );
  const session = parseAuthSession(rawSession);

  if (!session) {
    await clearAuthSession();
  }

  return session;
}

export async function createAndStoreAuthSession(
  input: AuthSignInInput,
): Promise<AuthSession> {
  const session: AuthSession = {
    createdAt: new Date().toISOString(),
    email: normalizeEmail(input.email),
    method: input.method,
    token: createSessionToken(),
    version: AUTH_SESSION_VERSION,
  };

  await SecureStore.setItemAsync(
    AUTH_SESSION_STORAGE_KEY,
    JSON.stringify(session),
    SECURE_STORE_OPTIONS,
  );

  return session;
}

export async function clearAuthSession(): Promise<void> {
  await SecureStore.deleteItemAsync(
    AUTH_SESSION_STORAGE_KEY,
    SECURE_STORE_OPTIONS,
  );
}

function parseAuthSession(rawSession: string | null): AuthSession | null {
  if (!rawSession) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawSession) as Partial<AuthSession>;

    if (
      parsed.version !== AUTH_SESSION_VERSION ||
      !isAuthMethod(parsed.method) ||
      typeof parsed.token !== "string" ||
      parsed.token.length < 24 ||
      typeof parsed.createdAt !== "string" ||
      Number.isNaN(Date.parse(parsed.createdAt))
    ) {
      return null;
    }

    return {
      createdAt: parsed.createdAt,
      email: normalizeEmail(parsed.email),
      method: parsed.method,
      token: parsed.token,
      version: AUTH_SESSION_VERSION,
    };
  } catch {
    return null;
  }
}

function isAuthMethod(value: unknown): value is AuthMethod {
  return (
    value === "apple" ||
    value === "google" ||
    value === "password" ||
    value === "signUp"
  );
}

function normalizeEmail(email: unknown): string | undefined {
  return typeof email === "string" && email.trim()
    ? email.trim().toLowerCase()
    : undefined;
}

function createSessionToken(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  const randomParts = Array.from({ length: 4 }, () =>
    Math.random().toString(36).slice(2),
  ).join("");

  return `${Date.now().toString(36)}-${randomParts}`;
}
