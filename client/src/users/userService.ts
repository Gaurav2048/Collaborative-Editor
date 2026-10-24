import type { User } from "../../../shared/protocol";
export async function listUsers(): Promise<User[]> {
  const r = await fetch("/api/users");
  if (!r.ok) throw new Error("Could not load workspace members.");
  return r.json();
}
export async function addUser(name: string, avatar: string): Promise<User> {
  const r = await fetch("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, avatar }),
  });
  const body = await r.json();
  if (!r.ok) throw new Error(body.error || "Could not add member.");
  return body;
}
