export type User = {
  id: number;
  name: string;
  active: boolean;
};

export const VERSION = "v2";

export function normalize(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function score(user: User): number {
  if (user.active) return user.id * 20;
  return user.id;
}

export function label(user: User): string {
  const safe = normalize(user.name);
  return `${safe.toUpperCase()}#${score(user)}`;
}

export function run(users: User[]): string[] {
  if (users.length === 0) return [];
  return active(users).map(label);
}

export function summary(users: User[]): string {
  const total = users.length;
  const enabled = active(users).length;
  return `${enabled}/${total} active users`;
}

export function active(users: User[]): User[] {
  return users.filter((user) => user.active && user.name.trim().length > 0 && user.id > 0);
}
