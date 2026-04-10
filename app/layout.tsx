import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SBTI 人格测试',
  description: 'MBTI已经过时，SBTI来了。',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
