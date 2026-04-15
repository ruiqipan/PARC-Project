import { cookies } from 'next/headers';

export const USER_ID_COOKIE = 'parc_user_id';
export const USERNAME_COOKIE = 'parc_username';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 365;

export interface ParcSession {
  userId: string;
  username: string;
}

export function normalizeUsername(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function isValidUsername(value: string): boolean {
  return /^[A-Za-z0-9 _-]{2,32}$/.test(value);
}

export async function getSession(): Promise<ParcSession | null> {
  const store = await cookies();
  const userId = store.get(USER_ID_COOKIE)?.value ?? '';
  const username = store.get(USERNAME_COOKIE)?.value ?? '';

  if (!userId || !username) {
    return null;
  }

  return { userId, username };
}
