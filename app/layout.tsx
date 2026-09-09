import type { Metadata } from 'next';
import './globals.css';
import './atlas-v3.css';
import './council-v4.css';
import './hierarchy-v5.css';
import './mobile-v7.css';

export const metadata: Metadata = {
  title: '大明职官图｜明代府州县与皇城官署交互舆图',
  description: '沿山川舆图探索明代两京十三省、辽东等边区卫所、府州县与京师皇城，按年份查阅职官与人物履历。',
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
