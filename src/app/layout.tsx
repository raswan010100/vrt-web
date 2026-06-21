import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VRT — Visual Regression Testing',
  description: 'Upload baseline, input URL, dan deteksi perubahan visual otomatis.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
