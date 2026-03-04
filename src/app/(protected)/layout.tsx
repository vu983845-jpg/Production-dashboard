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

    const { data: profile, error } = await supabase
        .from("profiles")
        .select("role, full_name, department_id")
        .eq("id", session.user.id)
        .single()

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

    return (
        <AppLayout role={profile.role} fullName={profile.full_name}>
            {children}
        </AppLayout>
    )
}
