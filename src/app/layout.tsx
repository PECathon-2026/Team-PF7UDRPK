import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Small Web Reader — Independent Blogs & Distraction-Free RSS',
  description: 'A privacy-first, offline-ready RSS reader and serendipitous discovery engine for the independent web.',
  icons: {
    icon: '/favicon.ico',
  },
};

export const viewport: Viewport = {
  themeColor: '#101116',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-reader-bg text-reader-text font-sans antialiased selection:bg-reader-selected selection:text-reader-accent min-h-screen overflow-hidden">
        {children}
      </body>
    </html>
  );
}
