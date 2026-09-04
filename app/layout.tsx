import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '大明职官图｜明代官制交互舆图',
  description: '从皇城朝堂到州府县衙，以空间与品秩探索明代职官体系。',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="dark">
      <body>{children}</body>
    </html>
  );
}
