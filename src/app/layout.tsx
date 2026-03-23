import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from "@/components/ui/sonner"
import { LanguageProvider } from "@/contexts/LanguageContext"
import { QueryProvider } from "@/components/providers/query-provider"
import { NuqsAdapter } from "nuqs/adapters/next/app"
import { ChatBox } from "@/components/chat/ChatBox"

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Dashboard VICC LA',
  description: 'KPI, Yield, Plan vs Actual Dashboard',
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
              <ChatBox />
              <Toaster position="top-right" richColors />
            </LanguageProvider>
          </NuqsAdapter>
        </QueryProvider>
      </body>
    </html>
  )
}
