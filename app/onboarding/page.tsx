import { cookies } from 'next/headers';
import { randomUUID } from 'crypto';
import PersonaTagger from '@/components/onboarding/PersonaTagger';

// Provide a stable per-browser user ID via a cookie until real auth is wired up.
// Once Supabase Auth is in place, replace this with the actual session user ID.
async function getOrCreateUserId(): Promise<string> {
  const store = await cookies();
  const existing = store.get('parc_anon_uid')?.value;
  if (existing) return existing;

  const newId = randomUUID();
  store.set('parc_anon_uid', newId, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 year
    httpOnly: true,
    sameSite: 'lax',
  });
  return newId;
}

export default async function OnboardingPage() {
  const userId = await getOrCreateUserId();
  return <PersonaTagger userId={userId} />;
}
