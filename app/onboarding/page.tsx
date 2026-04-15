import { cookies } from 'next/headers';
import PersonaTagger from '@/components/onboarding/PersonaTagger';

export default async function OnboardingPage() {
  // Cookie is set by middleware before this page renders
  const store = await cookies();
  const userId = store.get('parc_anon_uid')?.value ?? '';
  return <PersonaTagger userId={userId} />;
}
