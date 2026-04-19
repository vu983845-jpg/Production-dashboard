import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from "@/components/ui/sonner"
import { LanguageProvider } from "@/contexts/LanguageContext"
import { QueryProvider } from "@/components/providers/query-provider"
import { NuqsAdapter } from "nuqs/adapters/next/app"


const inter = Inter({ subsets: ['latin', 'vietnamese'] })

export const metadata: Metadata = {
  title: 'Dashboard VICC LA',
  description: 'KPI, Yield, Plan vs Actual Dashboard',
  icons: {
    icon: [
      { url: '/assets/intersnack-icon.png', type: 'image/png' },
      { url: '/assets/intersnack-icon.svg', type: 'image/svg+xml' },
    ],
    shortcut: '/assets/intersnack-icon.png',
    apple: '/assets/intersnack-icon.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="vi">
      <body className={inter.className}>
        <QueryProvider>
          <NuqsAdapter>
            <LanguageProvider>
              {children}
              <Toaster position="top-right" richColors />
            </LanguageProvider>
          </NuqsAdapter>
        </QueryProvider>
      </body>
    </html>
  )
}
