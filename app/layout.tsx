import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '大明职官图｜明代府州县与皇城官署交互舆图',
  description: '沿1580年明代历史地图进入两京十三省、府州、州县、县衙与京师皇城，查看带人物形象的明代职官。',
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
