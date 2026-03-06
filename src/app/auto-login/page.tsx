"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

function AutoLoginContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [status, setStatus] = useState("Đang xử lý thông tin đăng nhập...");

    useEffect(() => {
        let isMounted = true;

        const loginWithToken = async () => {
            // Standard approach
            let token = searchParams.get("token");

            // Fallback approach if URL was mangled by a chat app (e.g. ?token%3D...)
            if (!token && typeof window !== 'undefined') {
                const urlString = window.location.href;
                // Look for 'token=' or 'token%3D'
                const match = urlString.match(/token(?:=|%3D)([^&]+)/i);
                if (match && match[1]) {
                    // Replace URL-encoded equals signs at the end of base64 padding
                    token = match[1].replace(/%3D/g, '=');
                }
            }

            if (!token) {
                if (isMounted) {
                    toast.error("Không tìm thấy mã đăng nhập");
                    router.push("/login");
                }
                return;
            }

            try {
                if (isMounted) setStatus("Đang xác thực hệ thống...");

                // Call the new server API route to validate the Secret Key SSO token
                const response = await fetch('/api/auth/auto-login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ token })
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || "Lỗi xác thực tự động");
                }

                if (isMounted) {
                    toast.success("Đăng nhập tự động thành công!");
                    router.refresh(); // Refresh Next.js server components with new auth state
                    router.push("/dashboard"); // Redirect to main app
                }
            } catch (error: any) {
                console.error("Auto login error:", error);
                if (isMounted) {
                    toast.error(error.message || "Lỗi đăng nhập tự động. Vui lòng đăng nhập lại.");
                    router.push("/login");
                }
            }
        };

        loginWithToken();

        return () => {
            isMounted = false;
        };
    }, [router, searchParams]);

    return (
        <div className="flex flex-col items-center space-y-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-gray-600 font-medium">{status}</p>
        </div>
    );
}

export default function AutoLoginPage() {
    return (
        <div className="flex h-screen w-full items-center justify-center bg-gray-50">
            <Suspense fallback={
                <div className="flex flex-col items-center space-y-4">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <p className="text-gray-600 font-medium">Đang tải...</p>
                </div>
            }>
                <AutoLoginContent />
            </Suspense>
        </div>
    );
}
