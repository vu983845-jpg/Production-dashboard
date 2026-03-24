import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const supabase = await createClient()

    const {
        data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
        redirect("/login")
    }

    const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .single()

    // Chặn người dùng không phải Admin
    if (!profile || profile.role !== "admin") {
        redirect("/dashboard") // Hoặc trỏ sang trang Access Denied
    }

    return <>{children}</>
}
