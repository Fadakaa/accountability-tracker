import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ClientProviders } from "@/components/ClientProviders";

export const metadata: Metadata = {
  title: "Accountability Tracker",
  description:
    "The system that chases you. Daily habit tracking with streaks, XP, and escalating accountability.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Tracker",
  },
  icons: {
    icon: "/favicon.svg",
    apple: "/icons/icon-192.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#f97316",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body className="antialiased" style={{ backgroundColor: "#0a0a0f", color: "#e5e5e5" }} suppressHydrationWarning>
        <CapacitorPolyfills />
        <ServiceWorkerRegistration />
        <ClientProviders>
          <main className="min-h-screen">{children}</main>
        </ClientProviders>
      </body>
    </html>
  );
}

function CapacitorPolyfills() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
          // Polyfill crypto.randomUUID for iOS WebView
          if (typeof crypto !== 'undefined' && !crypto.randomUUID) {
            crypto.randomUUID = function() {
              return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, function(c) {
                return (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16);
              });
            };
          }
          // Polyfill AbortSignal.timeout for iOS WebView
          if (typeof AbortSignal !== 'undefined' && !AbortSignal.timeout) {
            AbortSignal.timeout = function(ms) {
              var controller = new AbortController();
              setTimeout(function() { controller.abort(); }, ms);
              return controller.signal;
            };
          }
        `,
      }}
    />
  );
}

function ServiceWorkerRegistration() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
          if ('serviceWorker' in navigator && !window.Capacitor) {
            window.addEventListener('load', function() {
              navigator.serviceWorker.register('/sw.js')
                .then(function(reg) { console.log('SW registered:', reg.scope); })
                .catch(function(err) { console.log('SW registration failed:', err); });
            });
          }
        `,
      }}
    />
  );
}
