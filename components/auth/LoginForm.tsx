'use client';

import { FormEvent, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    startTransition(async () => {
      try {
        const response = await fetch('/api/session/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.error ?? 'Unable to log in.');
        }

        router.push(data.redirectTo ?? '/onboarding');
        router.refresh();
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : 'Unable to log in.');
      }
    });
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#003580] via-[#0057a8] to-[#eaf3ff] px-4 py-16">
      <div className="mx-auto max-w-md rounded-3xl border border-white/50 bg-white/95 p-8 shadow-2xl shadow-blue-950/10 backdrop-blur">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#0071c2]">
          PRISM Session
        </p>
        <h1 className="mt-4 text-3xl font-bold text-gray-900">
          Sign in with a username
        </h1>
        <p className="mt-3 text-sm leading-6 text-gray-600">
          We&apos;ll keep one stable user ID behind the scenes for this username, then send you to tag selection.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label htmlFor="username" className="mb-2 block text-sm font-medium text-gray-700">
              Username
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={event => setUsername(event.target.value)}
              placeholder="e.g. alex_travels"
              className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#0071c2] focus:ring-4 focus:ring-[#0071c2]/15"
            />
          </div>

          {error ? (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isPending || !username.trim()}
            className="w-full rounded-2xl bg-[#003580] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#002a66] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? 'Starting session…' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
