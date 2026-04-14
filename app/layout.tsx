import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist-sans' });

export const metadata: Metadata = {
  title: 'Expedia · PARC',
  description: 'Smarter hotel reviews powered by PARC — Property Awareness & Review Completion',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={geist.variable}>
      <body className="bg-gray-50 text-gray-900 antialiased font-sans">
        {/* Top Nav */}
        <header className="sticky top-0 z-50 bg-[#003580] shadow-md">
          <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <a href="/" className="text-white font-bold text-xl tracking-tight hover:opacity-90">
                expedia
              </a>
              <span className="text-blue-200 text-xs font-semibold px-2 py-0.5 bg-blue-700 rounded-full">
                PARC Beta
              </span>
            </div>
            <nav className="hidden md:flex items-center gap-6 text-sm text-blue-100">
              <a href="/" className="hover:text-white transition-colors">Hotels</a>
              <a href="#" className="hover:text-white transition-colors">Flights</a>
              <a href="#" className="hover:text-white transition-colors">Packages</a>
            </nav>
          </div>
        </header>
        <main className="min-h-screen">{children}</main>
      </body>
    </html>
  );
}
