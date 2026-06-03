export const AUTH_COOKIE_NAME = "jira_tracking_auth";

export function getAuthPassword() {
  const password = process.env.AUTH_PASSWORD?.trim();
  if (!password) {
    throw new Error(
      "Configure AUTH_PASSWORD no .env para habilitar o login do sistema.",
    );
  }
  return password;
}

export async function createSessionToken(password: string) {
  const data = new TextEncoder().encode(password);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function getExpectedSessionToken() {
  return createSessionToken(getAuthPassword());
}

export async function verifySessionToken(token: string | undefined) {
  if (!token) return false;

  try {
    const expected = await getExpectedSessionToken();
    if (token.length !== expected.length) return false;

    let mismatch = 0;
    for (let i = 0; i < token.length; i++) {
      mismatch |= token.charCodeAt(i) ^ expected.charCodeAt(i);
    }
    return mismatch === 0;
  } catch {
    return false;
  }
}

export async function verifyPassword(candidate: string) {
  const password = getAuthPassword();
  if (candidate.length !== password.length) return false;

  let mismatch = 0;
  for (let i = 0; i < password.length; i++) {
    mismatch |= candidate.charCodeAt(i) ^ password.charCodeAt(i);
  }
  return mismatch === 0;
}

export function getAuthCookieOptions(maxAgeSeconds = 60 * 60 * 24 * 30) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
