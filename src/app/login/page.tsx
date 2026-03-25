"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { IntersnackLogo } from "@/components/intersnack-logo";
import { ArrowLeft } from "lucide-react";
import HCaptcha from "@hcaptcha/react-hcaptcha";

const HCAPTCHA_SITE_KEY = "9830204c-9c10-41fc-98fc-ba4a9aa2e2c8";

const CORE_VALUES = [
    { icon: "🌍", title: "Thinking Responsibly",     desc: "Đặt trách nhiệm lên hàng đầu trong mọi quyết định" },
    { icon: "🚀", title: "Acting Entrepreneurially", desc: "Tinh thần khởi nghiệp — sáng tạo và chủ động" },
    { icon: "🤝", title: "Growing Together",          desc: "Cùng nhau phát triển, tin tưởng và minh bạch" },
    { icon: "⭐", title: "Excellence & Passion",      desc: "Xuất sắc trong công việc với niềm đam mê" },
];

export default function LoginPage() {
    const [email, setEmail]           = useState("");
    const [password, setPassword]     = useState("");
    const [loading, setLoading]       = useState(false);
    const [captchaToken, setCaptchaToken] = useState("");
    const [mounted, setMounted]       = useState(false);
    const captchaRef = useRef<HCaptcha>(null);
    const router  = useRouter();
    const supabase = createClient();

    useEffect(() => {
        setMounted(true);
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) router.push("/dashboard");
        });
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
            if (session) router.push("/dashboard");
        });
        return () => subscription.unsubscribe();
    }, [router, supabase]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        const { data, error } = await supabase.auth.signInWithPassword({
            email, password, options: { captchaToken },
        });
        if (error) {
            toast.error(error.message);
            setLoading(false);
            captchaRef.current?.resetCaptcha();
            setCaptchaToken("");
            return;
        }
        if (data.user) {
            toast.success("Đăng nhập thành công!");
            router.refresh();
            router.push("/dashboard");
        }
    };

    return (
        <>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

                *, *::before, *::after { box-sizing: border-box; }

                .login-root {
                    display: flex;
                    height: 100vh;
                    width: 100%;
                    font-family: 'Inter', sans-serif;
                    overflow: hidden;
                }

                /* ── LEFT PANEL ── */
                .login-left {
                    flex: 0 0 48%;
                    background: #E30613;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: flex-start;
                    padding: 60px 52px;
                    position: relative;
                    overflow: hidden;
                }
                .login-left .deco {
                    position: absolute;
                    border-radius: 50%;
                    pointer-events: none;
                }
                .deco-1 { width:520px;height:520px;border:1px solid rgba(255,255,255,.12);top:-160px;right:-160px; }
                .deco-2 { width:360px;height:360px;border:1px solid rgba(255,255,255,.1);bottom:-110px;left:-90px; }
                .deco-3 { width:200px;height:200px;background:rgba(255,255,255,.06);bottom:80px;right:36px; }

                .login-brand {
                    display: flex;
                    align-items: center;
                    gap: 14px;
                    margin-bottom: 44px;
                    z-index: 1;
                }
                .login-brand-logo {
                    background: #fff;
                    border-radius: 14px;
                    padding: 8px;
                    display: flex;
                    box-shadow: 0 4px 16px rgba(0,0,0,.18);
                }
                .login-brand-name  { color:#fff; font-weight:800; font-size:20px; letter-spacing:-0.3px; line-height:1.1; }
                .login-brand-sub   { color:rgba(255,255,255,.65); font-size:12px; font-weight:500; }

                .login-headline { z-index:1; margin-bottom:32px; }
                .login-headline-label {
                    color:rgba(255,255,255,.65); font-size:11px; font-weight:700;
                    letter-spacing:2.5px; text-transform:uppercase; margin-bottom:8px;
                }
                .login-headline h1 {
                    color:#fff; font-weight:800; font-size:36px;
                    line-height:1.15; margin:0; letter-spacing:-0.5px;
                }
                .login-headline h1 em { font-style:italic; font-weight:300; }

                .cv-list { display:flex; flex-direction:column; gap:12px; width:100%; max-width:400px; z-index:1; }
                .cv-card {
                    display:flex; align-items:center; gap:14px;
                    background:rgba(255,255,255,.1);
                    border: 1px solid rgba(255,255,255,.2);
                    border-radius:14px;
                    padding:13px 16px;
                    opacity:0;
                    animation: slideUp 0.45s ease forwards;
                    transition: background .2s, transform .2s;
                    cursor:default;
                }
                .cv-card:hover { background:rgba(255,255,255,.18); transform:translateX(4px); }
                .cv-card:nth-child(1) { animation-delay:.08s; }
                .cv-card:nth-child(2) { animation-delay:.2s;  }
                .cv-card:nth-child(3) { animation-delay:.32s; }
                .cv-card:nth-child(4) { animation-delay:.44s; }

                .cv-icon {
                    font-size:20px; width:42px; height:42px; flex-shrink:0;
                    display:flex; align-items:center; justify-content:center;
                    background:rgba(255,255,255,.15); border-radius:11px;
                }
                .cv-title { color:#fff; font-weight:700; font-size:13px; line-height:1.3; }
                .cv-desc  { color:rgba(255,255,255,.6); font-size:11px; margin-top:2px; line-height:1.4; }

                .login-footer {
                    position:absolute; bottom:24px; left:52px;
                    color:rgba(255,255,255,.35); font-size:11px; z-index:1;
                }

                /* ── RIGHT PANEL ── */
                .login-right {
                    flex: 1;
                    background: #fff;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    padding: 56px 48px;
                    position: relative;
                    overflow-y: auto;
                }
                .login-back {
                    position:absolute; top:24px; left:24px;
                    display:flex; align-items:center; gap:6px;
                    color:#999; font-size:13px; text-decoration:none;
                    font-weight:500; transition:color .2s;
                }
                .login-back:hover { color:#E30613; }

                .login-form-wrap { width:100%; max-width:360px; }

                .login-form-title {
                    font-size:28px; font-weight:800; color:#111;
                    margin:0 0 6px; letter-spacing:-0.5px;
                }
                .login-form-sub { color:#888; font-size:14px; margin:0 0 32px; }

                .field-group { display:flex; flex-direction:column; gap:16px; }
                .field { display:flex; flex-direction:column; gap:6px; }
                .field label { color:#333; font-size:13px; font-weight:600; }

                .field input {
                    border-radius:10px;
                    border:1.5px solid #e5e5e5;
                    padding:11px 14px;
                    font-size:14px;
                    font-family:inherit;
                    transition:border-color .2s;
                    outline:none;
                    width:100%;
                    background:#fafafa;
                }
                .field input:focus { border-color:#E30613; background:#fff; }

                .captcha-wrap { display:flex; justify-content:center; }

                .btn-login {
                    width:100%; padding:13px;
                    border-radius:10px; border:none;
                    font-weight:700; font-size:15px;
                    cursor:pointer; font-family:inherit;
                    letter-spacing:-0.2px;
                    transition: background .2s, opacity .2s;
                }
                .btn-login.active   { background:#E30613; color:#fff; }
                .btn-login.active:hover { background:#c0040f; }
                .btn-login.inactive { background:#f0f0f0; color:#aaa; cursor:not-allowed; }

                .login-help { text-align:center; font-size:13px; color:#999; }
                .login-help span { color:#E30613; font-weight:600; cursor:pointer; }

                @keyframes slideUp {
                    from { opacity:0; transform:translateY(18px); }
                    to   { opacity:1; transform:translateY(0); }
                }

                /* ── MOBILE ── */
                @media (max-width: 768px) {
                    .login-root { flex-direction: column; height: auto; min-height: 100vh; }

                    /* Red banner on top for mobile */
                    .login-left {
                        flex: none;
                        width: 100%;
                        padding: 32px 24px 28px;
                        align-items: center;
                    }
                    .login-brand { margin-bottom: 20px; }
                    .login-headline { margin-bottom: 20px; text-align: center; }
                    .login-headline h1 { font-size: 26px; }
                    .login-headline-label { text-align: center; }
                    .cv-list { max-width: 100%; gap: 10px; }
                    .cv-title { font-size: 12px; }
                    .cv-desc  { font-size: 10px; }
                    .login-footer { display: none; }
                    .deco-1, .deco-2, .deco-3 { display: none; }

                    /* Form below */
                    .login-right {
                        flex: 1;
                        padding: 36px 24px 48px;
                        justify-content: flex-start;
                    }
                    .login-back { top: -999px; } /* hide on mobile, footer handles nav */
                    .login-form-title { font-size: 24px; }
                }

                @media (max-width: 400px) {
                    .login-left { padding: 24px 16px 20px; }
                    .cv-card { padding: 10px 12px; gap: 10px; }
                    .cv-icon { width:36px; height:36px; font-size:16px; }
                }
            `}</style>

            <div className="login-root">

                {/* ── LEFT ── */}
                <div className="login-left">
                    <div className="deco deco-1" />
                    <div className="deco deco-2" />
                    <div className="deco deco-3" />

                    <div className="login-brand">
                        <div className="login-brand-logo">
                            <IntersnackLogo className="h-10 w-10" />
                        </div>
                        <div>
                            <div className="login-brand-name">Intersnack</div>
                            <div className="login-brand-sub">VICC LA · Dashboard</div>
                        </div>
                    </div>

                    <div className="login-headline">
                        <p className="login-headline-label">Giá trị cốt lõi</p>
                        <h1>Our Core<br /><em>Values</em></h1>
                    </div>

                    {mounted && (
                        <div className="cv-list">
                            {CORE_VALUES.map((cv) => (
                                <div key={cv.title} className="cv-card">
                                    <div className="cv-icon">{cv.icon}</div>
                                    <div>
                                        <div className="cv-title">{cv.title}</div>
                                        <div className="cv-desc">{cv.desc}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <p className="login-footer">© {new Date().getFullYear()} Intersnack · VICC LA</p>
                </div>

                {/* ── RIGHT ── */}
                <div className="login-right">
                    <a href="https://dds-meeting.vercel.app/" className="login-back">
                        <ArrowLeft size={15} />
                        DDS Meeting
                    </a>

                    <div className="login-form-wrap">
                        <h2 className="login-form-title">Đăng nhập</h2>
                        <p className="login-form-sub">Chào mừng trở lại! Vui lòng nhập thông tin.</p>

                        <form onSubmit={handleLogin}>
                            <div className="field-group">
                                <div className="field">
                                    <label htmlFor="email">Email</label>
                                    <input
                                        id="email"
                                        type="email"
                                        placeholder="m@example.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                    />
                                </div>

                                <div className="field">
                                    <label htmlFor="password">Mật khẩu</label>
                                    <input
                                        id="password"
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                    />
                                </div>

                                <div className="captcha-wrap">
                                    <HCaptcha
                                        ref={captchaRef}
                                        sitekey={HCAPTCHA_SITE_KEY}
                                        onVerify={(token) => setCaptchaToken(token)}
                                        onExpire={() => setCaptchaToken("")}
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading || !captchaToken}
                                    className={`btn-login ${captchaToken ? "active" : "inactive"}`}
                                >
                                    {loading
                                        ? "Đang đăng nhập..."
                                        : !captchaToken
                                        ? "Vui lòng xác thực bên trên"
                                        : "Đăng nhập"}
                                </button>

                                <p className="login-help">
                                    Chưa có tài khoản?{" "}
                                    <span onClick={() => alert("Để yêu cầu cấp tài khoản, vui lòng liên hệ Zalo: 0945646999")}>
                                        Liên hệ hỗ trợ
                                    </span>
                                </p>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </>
    );
}
