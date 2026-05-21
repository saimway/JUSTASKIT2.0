import "./globals.css";

export const metadata = {
  title: "JUST ASK IT — Uncensored AI Chatbot",
  description: "An unrestricted, uncensored AI assistant powered by Groq. Ask anything, get real answers. No filters, no limits.",
  manifest: '/manifest.json',
  icons: {
    icon: '/logo.jpg',
    apple: '/logo.jpg',
  }
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#000000',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body>{children}</body>
    </html>
  );
}
