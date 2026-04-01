import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'XRPWatch — Real-time XRP Dashboard',
  description: 'Monitor XRP price, volume, transactions, and news in real-time.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
