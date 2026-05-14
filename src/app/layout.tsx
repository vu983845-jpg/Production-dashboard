import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from "@/components/ui/sonner"
import { LanguageProvider } from "@/contexts/LanguageContext"
import { QueryProvider } from "@/components/providers/query-provider"
import { NuqsAdapter } from "nuqs/adapters/next/app"


const inter = Inter({ subsets: ['latin', 'vietnamese'] })

export const metadata: Metadata = {
  title: 'Operations Portal',
  description: 'Operational metrics and reporting portal',
  icons: {
    icon: [
      { url: '/globe.svg', type: 'image/svg+xml' },
    ],
    shortcut: '/globe.svg',
    apple: '/globe.svg',
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
