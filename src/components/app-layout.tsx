"use client"

import { ReactNode } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
    LayoutDashboard,
    ClipboardEdit,
    FileSpreadsheet,
    Users,
    LogOut,
    Menu,
    ArrowLeft,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { createClient } from "@/lib/supabase/client"
import { IntersnackLogo } from "@/components/intersnack-logo"
import { LanguageToggle } from "@/components/language-toggle"
import { useLanguage } from "@/contexts/LanguageContext"
import { UserGuide } from "@/components/user-guide"

interface AppLayoutProps {
    children: ReactNode
    role: string
    fullName: string
}

export function AppLayout({ children, role, fullName }: AppLayoutProps) {
    const pathname = usePathname()
    const router = useRouter()
    const supabase = createClient()

    const handleSignOut = async () => {
        await supabase.auth.signOut()
        router.push("/login")
    }

    const { t } = useLanguage()

    const navItems = [
        {
            title: t("nav.dashboard"),
            href: "/dashboard",
            icon: LayoutDashboard,
            roles: ["admin", "dept_user", "viewer"],
        },
        {
            title: t("nav.input"),
            href: "/input",
            icon: ClipboardEdit,
            roles: ["admin", "dept_user"],
        },
        {
            title: t("nav.plan"),
            href: "/admin/plan",
            icon: FileSpreadsheet,
            roles: ["admin", "dept_user"],
        },
        {
            title: t("nav.users"),
            href: "/admin/users",
            icon: Users,
            roles: ["admin"],
        },
    ]

    return (
        <div className="flex min-h-screen w-full flex-col bg-muted/40">
            <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-4 md:px-6">
                <nav className="hidden flex-col gap-6 text-lg font-medium md:flex md:flex-row md:items-center md:gap-5 md:text-sm lg:gap-6">
                    <Link
                        href="/dashboard"
                        className="flex items-center gap-2 text-lg font-semibold md:text-base shrink-0 md:mr-2"
                    >
                        <IntersnackLogo className="h-8 w-8" />
                        <span className="hidden lg:inline text-red-600 font-bold tracking-tight whitespace-nowrap">VICC LA</span>
                        <span className="lg:hidden text-red-600 font-bold whitespace-nowrap">VICC LA</span>
                    </Link>
                    {navItems
                        .filter((item) => item.roles.includes(role))
                        .map((item) => {
                            const Icon = item.icon
                            const isActive = pathname.startsWith(item.href)
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={`transition-colors hover:text-foreground flex items-center gap-2 whitespace-nowrap shrink-0 ${isActive ? "text-foreground font-semibold" : "text-muted-foreground"
                                        }`}
                                >
                                    <Icon className="h-4 w-4" />
                                    {item.title}
                                </Link>
                            )
                        })}
                </nav>
                {/* Mobile menu */}
                <div className="md:hidden flex items-center gap-3">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="icon" className="shrink-0 md:hidden">
                                <Menu className="h-5 w-5" />
                                <span className="sr-only">Toggle navigation menu</span>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-[200px]">
                            <DropdownMenuLabel>Menu</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {navItems
                                .filter((item) => item.roles.includes(role))
                                .map((item) => (
                                    <DropdownMenuItem key={item.href} asChild>
                                        <Link href={item.href} className="w-full cursor-pointer">
                                            <item.icon className="mr-2 h-4 w-4" />
                                            {item.title}
                                        </Link>
                                    </DropdownMenuItem>
                                ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <Link href="/dashboard" className="flex items-center gap-1.5 shrink-0">
                        <IntersnackLogo className="h-7 w-7" />
                        <span className="text-red-600 font-bold tracking-tight" style={{ fontSize: '0.95rem' }}>VICC LA</span>
                    </Link>
                </div>

                <div className="flex flex-1 items-center justify-end gap-2 md:gap-4 lg:gap-6 shrink-0">
                    <Button variant="outline" size="sm" asChild className="gap-1.5 px-2 sm:px-3 text-muted-foreground hover:text-foreground">
                        <a href="https://dds-meeting.vercel.app/">
                            <ArrowLeft className="h-4 w-4" />
                            <span className="hidden sm:inline">DDS Meeting</span>
                            <span className="sm:hidden text-xs font-semibold">DDS</span>
                        </a>
                    </Button>
                    <LanguageToggle />

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="secondary" size="icon" className="rounded-full">
                                <Users className="h-5 w-5" />
                                <span className="sr-only">Toggle user menu</span>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuLabel className="font-normal">
                                <div className="flex flex-col space-y-1">
                                    <p className="text-sm font-medium leading-none">{fullName}</p>
                                    <p className="text-xs leading-none text-muted-foreground mt-1">
                                        {t("role")}: <span className="uppercase text-primary font-semibold">{role}</span>
                                    </p>
                                </div>
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={handleSignOut} className="text-red-500 cursor-pointer">
                                <LogOut className="mr-2 h-4 w-4" />
                                {t("logout")}
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </header>
            <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
                {children}
            </main>
            <footer className="mt-auto border-t bg-background px-4 py-3 sm:px-6">
                <div className="flex flex-col sm:flex-row justify-between items-center gap-2">
                    <UserGuide />
                    <span className="text-xs text-muted-foreground/60 italic font-medium">V.H</span>
                </div>
            </footer>
        </div>
    )
}
