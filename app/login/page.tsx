import { redirect } from 'next/navigation';
import LoginForm from '@/components/auth/LoginForm';
import { getSession } from '@/lib/session';

export default async function LoginPage() {
  const session = await getSession();

  if (session) {
    redirect('/');
  }

  return <LoginForm />;
}
