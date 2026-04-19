import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { AppLayout } from "@/components/app-layout"

export const dynamic = "force-dynamic"
export const revalidate = 0

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

    // ── Fetch profile & dept in parallel ──────────────────────────────────
    const profilePromise = supabase
        .from("profiles")
        .select("role, full_name, department_id")
        .eq("id", session.user.id)
        .single()

    const [{ data: profile, error }] = await Promise.all([profilePromise])

    if (!profile) {
        return (
            <div className="flex flex-col items-center justify-center p-10">
                <h1 className="text-2xl font-bold text-red-500 mb-4">Lỗi: Không tìm thấy Hồ sơ (Profile)</h1>
                <p className="mb-2"><strong>User ID hiện tại:</strong> {session.user.id}</p>
                <p className="mb-4 text-sm bg-gray-100 p-4 rounded text-red-600 font-mono w-full max-w-2xl break-all">
                    <strong>Thông báo lỗi từ Supabase:</strong> {JSON.stringify(error, null, 2)}
                </p>
                <div className="space-y-4">
                    <p>Có thể do:</p>
                    <ul className="list-disc pl-5">
                        <li>Bản ghi Profile của user bạn chưa được tạo trong bảng `profiles`.</li>
                        <li>Quyền RLS vẫn đang chặn không cho phép truy xuất.</li>
                    </ul>
                </div>
            </div>
        )
    }

    // Fetch dept details in parallel with profile (if user has a department)
    let deptCode = ""
    let deptName = ""
    if (profile?.department_id) {
        const { data: dept } = await supabase
            .from("departments")
            .select("code, name_en")
            .eq("id", profile.department_id)
            .single()
        deptCode = dept?.code || ""
        deptName = dept?.name_en || ""
    }

    return (
        <AppLayout
            role={profile.role}
            fullName={profile.full_name}
            departmentId={profile.department_id || ""}
            deptCode={deptCode}
            deptName={deptName}
        >
            {children}
        </AppLayout>
    )
}
