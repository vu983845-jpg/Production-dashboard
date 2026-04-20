"use client"

import { ReactNode, useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
    LayoutDashboard,
    ClipboardEdit,
    FileSpreadsheet,
    FileText,
    Users,
    LogOut,
    Menu,
    AlertTriangle,
    Zap,
    ShieldCheck,
    UtensilsCrossed,
    BarChart3,
    Flame,
    Thermometer,
    ChevronDown,
    MonitorCheck,
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
import { AIChatWidget } from "@/components/ai-chat"

interface AppLayoutProps {
    children: ReactNode
    role: string
    fullName: string
    departmentId: string
    deptCode: string
    deptName: string
}

export function AppLayout({ children, role, fullName, departmentId, deptCode, deptName }: AppLayoutProps) {
    const pathname = usePathname()
    const router = useRouter()
    const supabase = createClient()

    const handleSignOut = async () => {
        await supabase.auth.signOut()
        router.push("/login")
    }

    // Cache user info for instant access by DashboardLoader
    useEffect(() => {
        if (deptCode) sessionStorage.setItem("vicc_dept_code", deptCode)
        if (fullName) sessionStorage.setItem("vicc_user_name", fullName)
    }, [deptCode, fullName])

    const { t } = useLanguage()

    // ── Open downtime warning ──────────────────────────────────────────────
    const [openDowntimes, setOpenDowntimes] = useState<any[]>([])
    const [dtBannerDismissed, setDtBannerDismissed] = useState(false)

    useEffect(() => {
        if (!departmentId) return
        const sessionKey = `dt_banner_dismissed_${departmentId}`
        if (sessionStorage.getItem(sessionKey)) { setDtBannerDismissed(true); return }

        supabase
            .from('downtime_events')
            .select('id, root_cause, note, machine_area, work_date')
            .eq('department_id', departmentId)
            .eq('is_ongoing', true)
            .eq('exclude_downtime', false)
            .then(({ data }) => {
                if (data && data.length > 0) setOpenDowntimes(data)
            })
    }, [departmentId])

    const dismissDtBanner = () => {
        setDtBannerDismissed(true)
        sessionStorage.setItem(`dt_banner_dismissed_${departmentId}`, '1')
    }
    // ──────────────────────────────────────────────────────────────────────

    type NavItem = { title: string; href: string; icon: React.ElementType; roles: string[]; children?: never }
    type NavGroup = { title: string; icon: React.ElementType; roles: string[]; href?: never; children: { title: string; href: string; icon: React.ElementType }[] }
    type NavEntry = NavItem | NavGroup

    const navItems: NavEntry[] = [
        {
            title: t("nav.dashboard"),
            href: "/dashboard",
            icon: LayoutDashboard,
            roles: ["admin", "dept_user", "viewer", "hse_admin", "HSE", "hse", "plant_manager", "hr_admin", "maint"],
        },
        {
            title: t("nav.input"),
            href: "/input",
            icon: ClipboardEdit,
            roles: ["dept_user", "HSE", "hse_admin"],
        },
        {
            title: t("nav.plan"),
            href: "/plan",
            icon: FileSpreadsheet,
            roles: ["admin", "dept_user", "hse_admin", "HSE", "hse"],
        },
        {
            title: "Report",
            href: "/report",
            icon: FileText,
            roles: ["admin", "dept_user", "viewer", "hse_admin", "HSE", "hse", "plant_manager", "hr_admin", "maint"],
        },
        {
            title: "Analytics",
            href: "/analytics",
            icon: BarChart3,
            roles: ["admin", "dept_user", "viewer", "hse_admin", "HSE", "hse", "plant_manager", "hr_admin", "maint"],
        },
        {
            title: t("nav.users"),
            href: "/admin/users",
            icon: Users,
            roles: ["admin"],
        },
        {
            title: "Energy",
            href: "/energy",
            icon: Zap,
            roles: ["admin", "dept_user", "viewer", "hse_admin", "HSE", "hse", "plant_manager", "maint", "hr_admin"],
        },
        // TODO: Unhide when V-NET API connection is working
        // {
        //     title: "Giám sát",
        //     icon: MonitorCheck,
        //     roles: ["admin", "dept_user", "viewer", "hse_admin", "HSE", "hse", "plant_manager", "maint"],
        //     children: [
        //         { title: "Steaming", href: "/steaming", icon: Flame },
        //         { title: "BORMA Ovens", href: "/borma", icon: Thermometer },
        //     ],
        // },
        {
            title: "Báo Cơm",
            href: "/bao-com",
            icon: UtensilsCrossed,
            roles: ["hr", "hr_admin", "HSE", "hse", "hse_admin"],
        },
    ]

    return (
        <>
            <div className="flex min-h-screen w-full flex-col bg-muted/40">
                <header className="sticky top-0 z-30 flex h-16 items-center gap-4 bg-[#E30613] text-white px-4 md:px-6 shadow-md overflow-hidden">
                    <nav className="hidden md:flex flex-row items-center gap-5 text-sm min-w-0 flex-1 overflow-x-auto scrollbar-none">
                        <Link
                            href="/dashboard"
                            className="flex items-center gap-2 text-base font-semibold shrink-0 mr-2 text-white"
                        >
                            <div className="bg-white rounded-lg shadow-sm w-9 h-9 overflow-hidden flex items-center justify-center">
                                <IntersnackLogo className="w-full h-full" />
                            </div>
                            <span className="text-white font-bold tracking-tight whitespace-nowrap">VICC LA</span>
                        </Link>
                        {navItems
                            .filter((item) => item.roles.includes(role))
                            .map((item) => {
                                const Icon = item.icon
                                if ('children' in item && item.children) {
                                    const isActive = item.children.some(c => pathname.startsWith(c.href))
                                    return (
                                        <DropdownMenu key={item.title}>
                                            <DropdownMenuTrigger className={`flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors hover:text-white outline-none ${isActive ? "text-white font-bold" : "text-white/70"}`}>
                                                <Icon className="h-4 w-4" />
                                                {item.title}
                                                <ChevronDown className="h-3 w-3 opacity-70" />
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="start" className="w-44">
                                                {item.children.map(child => {
                                                    const CIcon = child.icon
                                                    return (
                                                        <DropdownMenuItem key={child.href} asChild>
                                                            <Link href={child.href} className="flex items-center gap-2 cursor-pointer">
                                                                <CIcon className="h-4 w-4" />
                                                                {child.title}
                                                            </Link>
                                                        </DropdownMenuItem>
                                                    )
                                                })}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    )
                                }
                                const isActive = pathname.startsWith(item.href!)
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href!}
                                        className={`transition-colors hover:text-white flex items-center gap-2 whitespace-nowrap shrink-0 ${isActive ? "text-white font-bold" : "text-white/70"}`}
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
                                <Button variant="ghost" size="icon" className="shrink-0 md:hidden text-white hover:bg-white/10 hover:text-white border border-white/20">
                                    <Menu className="h-5 w-5" />
                                    <span className="sr-only">Toggle navigation menu</span>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-[200px]">
                                <DropdownMenuLabel>Menu</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {navItems
                                    .filter((item) => item.roles.includes(role))
                                    .flatMap((item) => {
                                        if ('children' in item && item.children) {
                                            return item.children.map(child => (
                                                <DropdownMenuItem key={child.href} asChild>
                                                    <Link href={child.href} className="w-full cursor-pointer">
                                                        <child.icon className="mr-2 h-4 w-4" />
                                                        {child.title}
                                                    </Link>
                                                </DropdownMenuItem>
                                            ))
                                        }
                                        return [
                                            <DropdownMenuItem key={item.href} asChild>
                                                <Link href={item.href!} className="w-full cursor-pointer">
                                                    <item.icon className="mr-2 h-4 w-4" />
                                                    {item.title}
                                                </Link>
                                            </DropdownMenuItem>
                                        ]
                                    })}
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Link href="/dashboard" className="flex items-center gap-2 shrink-0 text-white transition-opacity hover:opacity-90">
                            <div className="bg-white rounded-[6px] shadow-sm w-7 h-7 overflow-hidden flex items-center justify-center">
                                <IntersnackLogo className="w-full h-full" />
                            </div>
                            <span className="text-white font-bold tracking-tight" style={{ fontSize: '0.95rem' }}>VICC LA</span>
                        </Link>
                    </div>

                    <div className="flex items-center justify-end gap-2 shrink-0 ml-auto">
                        <Button variant="ghost" size="sm" asChild className="gap-1.5 px-2 text-white hover:bg-white/10 hover:text-white">
                            <Link href="/downtime">
                                <AlertTriangle className="h-4 w-4" />
                                <span className="hidden lg:inline">Downtime</span>
                            </Link>
                        </Button>
                        <div className="text-white hover:bg-white/10 rounded-md">
                            <LanguageToggle />
                        </div>

                        {/* Logout button always visible */}
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleSignOut}
                            className="gap-1.5 px-2 text-white hover:bg-white/10 hover:text-white shrink-0"
                            title={t("logout")}
                        >
                            <LogOut className="h-4 w-4" />
                            <span className="hidden lg:inline">{t("logout")}</span>
                        </Button>

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="rounded-full text-white hover:bg-white/10 hover:text-white border border-white/20 shrink-0">
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
                    {/* Open downtime warning banner */}
                    {!dtBannerDismissed && openDowntimes.length > 0 && (
                        <div className="rounded-xl border-2 border-orange-300 bg-orange-50 px-4 py-3 flex items-start gap-3 shadow-sm">
                            <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                                <p className="font-bold text-orange-800 text-sm">
                                    ⚠️ Bạn đang có {openDowntimes.length} sự cố downtime chưa đóng!
                                </p>
                                <div className="mt-1 flex flex-wrap gap-2">
                                    {openDowntimes.map(dt => (
                                        <span key={dt.id} className="text-[11px] bg-orange-100 border border-orange-200 text-orange-700 px-2 py-0.5 rounded-full">
                                            {dt.root_cause}{dt.machine_area ? ` · ${dt.machine_area}` : ''}{dt.note ? ` — ${dt.note}` : ''}
                                        </span>
                                    ))}
                                </div>
                                <Link href="/downtime" className="text-[11px] text-orange-600 underline underline-offset-2 mt-1 inline-block hover:text-orange-800">
                                    → Vào trang Downtime để đóng sự cố
                                </Link>
                            </div>
                            <button
                                onClick={dismissDtBanner}
                                className="shrink-0 text-orange-400 hover:text-orange-700 text-base font-bold leading-none"
                                title="Đóng cảnh báo"
                            >✕</button>
                        </div>
                    )}
                    {children}
                </main>
                <footer className="mt-auto border-t bg-background px-4 py-3 sm:px-6">
                    <div className="flex flex-col sm:flex-row justify-between items-center gap-2">
                        <UserGuide />
                        <div className="flex items-center gap-4">
                            <span className="text-[10px] font-mono bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full font-bold shadow-sm tracking-wider">v1.1.0</span>
                            <img src="https://api.visitorbadge.io/api/visitors?path=vicc-la-dashboard&label=L%C6%B0%E1%BB%A3t%20truy%20c%E1%BA%ADp&countColor=%233b82f6" alt="Lượt truy cập" className="h-5 opacity-80 hover:opacity-100 transition-opacity" />
                            <span className="text-xs text-muted-foreground/60 italic font-medium">V.H</span>
                        </div>
                    </div>
                </footer>
            </div>
            {/* AI Chat Widget — disabled */}
            {/* <AIChatWidget userContext={{ deptId: departmentId, deptCode: deptCode || role, deptName: deptName || "Toàn nhà máy", role, fullName }} /> */}
        </>
    )
}
