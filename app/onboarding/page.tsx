import { redirect } from 'next/navigation';
import PersonaTagger from '@/components/onboarding/PersonaTagger';
import { createServerClient } from '@/lib/supabase';
import { getSession } from '@/lib/session';

export default async function OnboardingPage() {
  const session = await getSession();

  if (!session) {
    redirect('/login');
  }

  const supabase = createServerClient();
  const { data: persona } = await supabase
    .from('User_Personas')
    .select('tags, username')
    .eq('user_id', session.userId)
    .maybeSingle();

  return (
    <PersonaTagger
      userId={session.userId}
      username={persona?.username ?? session.username}
      initialSelectedTags={persona?.tags ?? []}
    />
  );
}
