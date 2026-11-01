import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { Archivo, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

const archivo = Archivo({ subsets: ['latin'], variable: '--font-archivo' });
const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-plex-mono' });

export const metadata: Metadata = {
  title: 'Divvy Live',
  description: 'Find the Divvy stations on your route that need the most help, updated live.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: 'var(--bike)',
          colorPrimaryForeground: 'var(--surface)',
          colorBackground: 'var(--surface)',
          colorForeground: 'var(--ink)',
          colorMutedForeground: 'var(--muted)',
          colorInput: 'var(--bg)',
          colorInputForeground: 'var(--ink)',
          colorNeutral: 'var(--ink)',
          colorDanger: 'var(--bad)',
          fontFamily: 'var(--font-archivo), "Helvetica Neue", Arial, sans-serif',
          borderRadius: '0.5rem',
        },
      }}
    >
      <html lang="en" className={`${archivo.variable} ${plexMono.variable}`}>
        <body className="min-h-dvh antialiased">{children}</body>
      </html>
    </ClerkProvider>
  );
}
