import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Lazy-initialized browser client — avoids crashing during build with placeholder env vars
let _browserClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!_browserClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key || url === 'your_supabase_url') {
      throw new Error('Supabase env vars not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local');
    }
    _browserClient = createClient(url, key);
  }
  return _browserClient;
}

// For convenience — named export for client components
export const supabase = {
  get client() { return getSupabaseClient(); },
  from: (...args: Parameters<SupabaseClient['from']>) => getSupabaseClient().from(...args),
};

// Server-only client with service role (bypasses RLS — never import in client components)
export function createServerClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || url === 'your_supabase_url') {
    throw new Error('Supabase env vars not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
