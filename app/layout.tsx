import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'PARC Hotels',
  description: 'Find and book hotels worldwide',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-gray-50 text-gray-900 antialiased font-sans">
        {/* Top Nav */}
        <header className="sticky top-0 z-50 bg-[#003580] shadow-md">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
            {/* Logo */}
            <a href="/" className="flex items-center gap-2.5 hover:opacity-90 transition-opacity">
              <span className="text-white font-bold text-xl tracking-tight">PARC</span>
            </a>

            {/* Nav */}
            <nav className="flex items-center gap-1">
              <a
                href="/"
                className="text-white text-sm font-medium px-3 py-1.5 rounded-md hover:bg-white/10 transition-colors"
              >
                Hotels
              </a>
            </nav>
          </div>
        </header>

        <main className="min-h-screen">{children}</main>

        {/* Footer */}
        <footer className="bg-gray-900 text-gray-400 mt-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <span className="text-white font-bold text-lg">PARC</span>
              <p className="text-xs text-gray-500">
                © {new Date().getFullYear()} Expedia Hotels. All rights reserved.
              </p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
