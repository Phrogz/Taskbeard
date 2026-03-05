export type AuthUser = { email: string; role: "admin" | "viewer" };

export async function getClientId(): Promise<string | null> {
  const response = await fetch("/api/auth/client-id");
  if (!response.ok) return null;
  const data = await response.json();
  return data.client_id ?? null;
}

export async function login(credential: string): Promise<AuthUser> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential }),
  });
  if (response.status === 403) {
    const data = await response.json();
    throw new Error(data.detail ?? "Not authorized");
  }
  if (!response.ok) {
    throw new Error("Login failed");
  }
  return response.json();
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}

export async function getMe(): Promise<AuthUser | null> {
  const response = await fetch("/api/auth/me");
  if (!response.ok) return null;
  const data = await response.json();
  return data.user ?? null;
}
