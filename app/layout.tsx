import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Link from 'next/link';
import './globals.css';
import { getSession } from '@/lib/session';
import LogoutButton from '@/components/auth/LogoutButton';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'PRISM',
  description: 'Find and book hotels worldwide',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-gray-50 text-gray-900 antialiased font-sans">
        {/* Top Nav */}
        <header className="sticky top-0 z-50 bg-[#003580] shadow-md">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2.5 hover:opacity-90 transition-opacity">
              <span className="text-white font-bold text-xl tracking-tight">PRISM</span>
            </Link>

            {/* Nav */}
            <nav className="flex items-center gap-2">
              <Link
                href="/"
                className="text-white text-sm font-medium px-3 py-1.5 rounded-md hover:bg-white/10 transition-colors"
              >
                Hotels
              </Link>
              {session ? (
                <>
                  <Link
                    href="/onboarding"
                    className="text-white text-sm font-medium px-3 py-1.5 rounded-md hover:bg-white/10 transition-colors"
                  >
                    My Profile
                  </Link>
                  <span className="hidden sm:inline text-blue-100 text-sm">
                    {session.username}
                  </span>
                  <LogoutButton />
                </>
              ) : (
                <Link
                  href="/login"
                  className="text-white text-sm font-medium px-3 py-1.5 rounded-md hover:bg-white/10 transition-colors"
                >
                  Login
                </Link>
              )}
            </nav>
          </div>
        </header>

        <main className="min-h-screen">{children}</main>

        {/* Footer */}
        <footer className="bg-gray-900 text-gray-400 mt-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
            <div className="flex items-start sm:items-center justify-between gap-4">
              <span className="text-white font-bold text-lg">PRISM by PARC Group</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
