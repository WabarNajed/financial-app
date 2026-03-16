import './globals.css';
import { StoreProvider } from '@/lib/store-context';

export const metadata = {
  title: 'Store',
  description: 'Premium Online Store',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
