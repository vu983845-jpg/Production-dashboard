import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { AppLayout } from "@/components/app-layout"

interface ProtectedLayoutProps {
    children: React.ReactNode
}

export default async function ProtectedLayout({ children }: ProtectedLayoutProps) {
    const supabase = await createClient()

    const {
        data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
        redirect("/login")
    }

    const { data: profile } = await supabase
        .from("profiles")
        .select("role, full_name, department_id")
        .eq("id", session.user.id)
        .single()

    if (!profile) {
        redirect("/login")
    }

    return (
        <AppLayout role={profile.role} fullName={profile.full_name}>
            {children}
        </AppLayout>
    )
}
