import type { Metadata } from 'next';
import { Noto_Sans_KR } from 'next/font/google';
import './globals.css';

const notoSansKr = Noto_Sans_KR({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-noto-sans-kr',
});

export const metadata: Metadata = {
  title: '자리배치',
  description: '교실 자리배치 도우미',
};

const scriptSrc =
  process.env.NODE_ENV === 'development'
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'";

const csp = [
  "default-src 'self'",
  scriptSrc,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <meta httpEquiv="Content-Security-Policy" content={csp} />
      </head>
      <body className={notoSansKr.variable}>{children}</body>
    </html>
  );
}
