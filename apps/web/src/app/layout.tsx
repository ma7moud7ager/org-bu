import type { Metadata } from 'next';
import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/500.css';
import '@fontsource/ibm-plex-sans-arabic/700.css';
import { htmlAttributes } from '@/lib/shell';
import './globals.css';

export const metadata: Metadata = { title: 'org BU — إدارة الشركات', description: 'منصة إدارة الشركات' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html {...htmlAttributes}>
      <body className="font-[family-name:'IBM_Plex_Sans_Arabic',sans-serif] bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
