"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { IntersnackLogo } from "@/components/intersnack-logo";
import { ArrowLeft } from "lucide-react";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const supabase = createClient();

    useEffect(() => {
        // Automatically check for a valid session on mount (catches #access_token on URL)
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                router.push('/dashboard');
            }
        });

        // Listen for standard auth state changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' || session) {
                router.push('/dashboard');
            }
        });

        return () => subscription.unsubscribe();
    }, [router, supabase]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            toast.error(error.message);
            setLoading(false);
            return;
        }

        if (data.user) {
            // Fetch role
            const { data: profile } = await supabase
                .from("profiles")
                .select("role")
                .eq("id", data.user.id)
                .single();

            toast.success("Đăng nhập thành công!");
            router.refresh();
            if (profile?.role === "admin") {
                router.push("/dashboard");
            } else {
                router.push("/dashboard");
            }
        }
    };

    return (
        <div className="flex h-screen w-full items-center justify-center bg-gray-50 relative">
            <Button variant="ghost" className="absolute top-4 left-4 sm:top-6 sm:left-6 gap-2 text-muted-foreground hover:text-foreground" asChild>
                <a href="https://dds-meeting.vercel.app/">
                    <ArrowLeft className="h-4 w-4" />
                    <span className="hidden sm:inline">Quay lại DDS Meeting</span>
                    <span className="sm:hidden">DDS Meeting</span>
                </a>
            </Button>
            <Card className="w-full max-w-sm">
                <CardHeader className="text-center pb-6">
                    <div className="flex justify-center mb-4">
                        <IntersnackLogo className="h-16 w-16" />
                    </div>
                    <CardTitle className="text-2xl font-bold">Đăng nhập</CardTitle>
                    <CardDescription>Hệ thống quản lý sản lượng nhà máy</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="m@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">Mật khẩu</Label>
                            <Input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading ? "Đang đăng nhập..." : "Đăng nhập"}
                        </Button>
                        <div className="text-center mt-4 text-sm text-muted-foreground w-full">
                            Bạn chưa có tài khoản?{" "}
                            <span
                                className="text-primary hover:underline cursor-pointer font-medium"
                                onClick={() => {
                                    alert("Để yêu cầu cấp tài khoản, vui lòng liên hệ Zalo: 0945646999");
                                }}
                            >
                                Liên hệ hỗ trợ
                            </span>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
