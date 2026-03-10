import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Saudi Dropshipping Admin',
  description: 'Admin control panel for Saudi AI Dropshipping System',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
