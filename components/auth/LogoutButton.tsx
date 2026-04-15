'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

export default function LogoutButton() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleLogout() {
    setError('');

    startTransition(async () => {
      try {
        const response = await fetch('/api/session/logout', { method: 'POST' });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.error ?? 'Logout failed.');
        }

        router.push(data.redirectTo ?? '/login');
        router.refresh();
      } catch (logoutError) {
        setError(logoutError instanceof Error ? logoutError.message : 'Logout failed.');
      }
    });
  }

  return (
    <div className="flex items-center">
      <button
        type="button"
        onClick={handleLogout}
        disabled={isPending}
        className="rounded-md border border-white/20 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? 'Logging out…' : 'Logout'}
      </button>
      {error ? <span className="sr-only">{error}</span> : null}
    </div>
  );
}
