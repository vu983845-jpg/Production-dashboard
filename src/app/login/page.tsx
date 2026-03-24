"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { IntersnackLogo } from "@/components/intersnack-logo";
import { ArrowLeft } from "lucide-react";

const TURNSTILE_SITE_KEY = "0x4AAAAAACvSpDkYeXwvJCrC2Mi4rLw6Kws";

declare global {
    interface Window {
        turnstile: {
            render: (container: string | HTMLElement, options: object) => string;
            reset: (widgetId: string) => void;
            remove: (widgetId: string) => void;
        };
        onTurnstileLoad: () => void;
    }
}

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [captchaToken, setCaptchaToken] = useState("");
    const widgetRef = useRef<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const router = useRouter();
    const supabase = createClient();

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) router.push('/dashboard');
        });
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' || session) router.push('/dashboard');
        });
        return () => subscription.unsubscribe();
    }, [router, supabase]);

    function renderWidget() {
        if (!containerRef.current || !window.turnstile || widgetRef.current) return;
        widgetRef.current = window.turnstile.render(containerRef.current, {
            sitekey: TURNSTILE_SITE_KEY,
            callback: (token: string) => setCaptchaToken(token),
            "expired-callback": () => setCaptchaToken(""),
            "error-callback": () => setCaptchaToken(""),
            theme: "light",
        });
    }

    // Load Cloudflare Turnstile script manually
    useEffect(() => {
        const scriptId = "cf-turnstile-script";
        if (document.getElementById(scriptId)) {
            // Script already loaded
            setTimeout(renderWidget, 300);
            return;
        }
        window.onTurnstileLoad = renderWidget;
        const script = document.createElement("script");
        script.id = scriptId;
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad&render=explicit";
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);

        return () => {
            if (widgetRef.current && window.turnstile) {
                try { window.turnstile.remove(widgetRef.current); } catch {}
                widgetRef.current = null;
            }
        };
    }, []);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
            options: { captchaToken },
        });

        if (error) {
            toast.error(error.message);
            setLoading(false);
            if (widgetRef.current && window.turnstile) {
                window.turnstile.reset(widgetRef.current);
                setCaptchaToken("");
            }
            return;
        }

        if (data.user) {
            toast.success("Đăng nhập thành công!");
            router.refresh();
            router.push("/dashboard");
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
                    <CardDescription>Dashboard VICC LA</CardDescription>
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
                        <div ref={containerRef} className="flex justify-center my-2" />
                        <Button type="submit" className="w-full" disabled={loading || !captchaToken}>
                            {loading ? "Đang đăng nhập..." : !captchaToken ? "Đang tải xác thực..." : "Đăng nhập"}
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
