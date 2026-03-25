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
    { img: "/cv-thinking.svg", bg: "#6B8C2A", title: "Thinking Responsibly",     desc: "Đặt trách nhiệm lên hàng đầu trong mọi quyết định" },
    { img: "/cv-acting.svg",   bg: "#C8102E", title: "Acting Entrepreneurially", desc: "Tinh thần khởi nghiệp — sáng tạo và chủ động" },
    { img: "/cv-growing.svg",  bg: "#D4A017", title: "Growing Together",          desc: "Cùng nhau phát triển, tin tưởng và minh bạch" },
    { img: "/cv-acting.svg",   bg: "#7C3AED", title: "Excellence & Passion",      desc: "Xuất sắc trong công việc với niềm đam mê" },
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
                    background: #000;
                }

                /* ── LEFT PANEL: Industrial Premium ── */
                .login-left {
                    flex: 0 0 50%;
                    background: #111111;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: flex-start;
                    padding: 80px 64px;
                    position: relative;
                    overflow: hidden;
                }

                /* Subtle Grid Pattern */
                .login-left::before {
                    content: '';
                    position: absolute;
                    inset: 0;
                    background-image: linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
                                      linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
                    background-size: 40px 40px;
                    pointer-events: none;
                }

                /* Elegant Red Accent Line */
                .login-left::after {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 4px;
                    height: 100%;
                    background: #E30613;
                }

                .login-brand {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    margin-bottom: 60px;
                    z-index: 2;
                }
                .login-brand-logo {
                    background: #E30613; /* Primary Red as accent for logo background */
                    border-radius: 12px;
                    padding: 10px;
                    display: flex;
                    box-shadow: 0 8px 24px rgba(227, 6, 19, 0.3);
                }
                .login-brand-name  { color:#fff; font-weight:800; font-size:22px; letter-spacing:-0.5px; }
                .login-brand-sub   { color:rgba(255,255,255,0.5); font-size:12px; font-weight:500; margin-top: -2px; }

                .login-headline { z-index:2; margin-bottom:44px; }
                .login-headline-label {
                    color:#E30613; font-size:11px; font-weight:800;
                    letter-spacing:3px; text-transform:uppercase; margin-bottom:12px;
                }
                .login-headline h1 {
                    color:#fff; font-weight:800; font-size:48px;
                    line-height:1.1; margin:0; letter-spacing:-1px;
                }
                .login-headline h1 em { font-style:italic; font-weight:300; display:block; opacity: 0.8; }

                .cv-list { display:flex; flex-direction:column; gap:14px; width:100%; max-width:440px; z-index:2; }
                .cv-card {
                    display:flex; align-items:center; gap:18px;
                    background: rgba(255, 255, 255, 0.03);
                    backdrop-filter: blur(8px);
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    border-radius:16px;
                    padding:16px 20px;
                    opacity:0;
                    animation: slideUp 0.6s cubic-bezier(0.22, 1, 0.36, 1) forwards;
                    transition: all .3s;
                    cursor:default;
                }
                .cv-card:hover { 
                    background: rgba(255, 255, 255, 0.07); 
                    border-color: rgba(227, 6, 19, 0.4);
                    transform: translateX(8px); 
                }

                .cv-card:nth-child(1) { animation-delay:.1s; }
                .cv-card:nth-child(2) { animation-delay:.2s; }
                .cv-card:nth-child(3) { animation-delay:.3s; }
                .cv-card:nth-child(4) { animation-delay:.4s; }

                .cv-icon {
                    width:44px; height:44px; flex-shrink:0;
                    display:flex; align-items:center; justify-content:center;
                    background:rgba(255,255,255,0.05); border-radius:12px;
                    border: 1px solid rgba(255,255,255,0.05);
                }
                .cv-title { color:#fff; font-weight:700; font-size:14px; margin-bottom: 2px; }
                .cv-desc  { color:rgba(255,255,255,0.4); font-size:12px; line-height:1.4; }

                .login-footer {
                    position:absolute; bottom:32px; left:64px;
                    color:rgba(255,255,255,0.2); font-size:11px; z-index:2;
                    letter-spacing: 0.5px;
                }

                /* ── RIGHT PANEL ── */
                .login-right {
                    flex: 1;
                    background: #ffffff;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    padding: 60px;
                    position: relative;
                    overflow-y: auto;
                }
                .login-back {
                    position:absolute; top:32px; left:32px;
                    display:flex; align-items:center; gap:8px;
                    color:#888; font-size:13px; text-decoration:none;
                    font-weight:600; transition:all .2s;
                    padding: 8px 12px;
                    border-radius: 8px;
                }
                .login-back:hover { color:#111; background: #f5f5f5; }

                .login-form-wrap { width:100%; max-width:380px; }

                .login-form-title {
                    font-size:32px; font-weight:800; color:#111;
                    margin:0 0 8px; letter-spacing:-1px;
                }
                .login-form-sub { color:#666; font-size:15px; margin:0 0 40px; font-weight: 400; }

                .field-group { display:flex; flex-direction:column; gap:20px; }
                .field { display:flex; flex-direction:column; gap:8px; }
                .field label { color:#111; font-size:13px; font-weight:700; text-transform: uppercase; letter-spacing: 0.5px; }

                .field input {
                    border-radius:12px;
                    border: 2px solid #f0f0f0;
                    padding:14px 16px;
                    font-size:15px;
                    font-family:inherit;
                    transition: all .2s;
                    outline:none;
                    width:100%;
                    background:#f9f9f9;
                }
                .field input:focus { border-color:#E30613; background:#fff; box-shadow: 0 0 0 4px rgba(227, 6, 19, 0.05); }

                .captcha-wrap { display:flex; justify-content:center; margin-top: 5px; }

                .btn-login {
                    width:100%; padding:16px;
                    border-radius:12px; border:none;
                    font-weight:800; font-size:16px;
                    cursor:pointer; font-family:inherit;
                    letter-spacing:-0.3px;
                    transition: all .3s cubic-bezier(0.22, 1, 0.36, 1);
                    margin-top: 10px;
                }
                .btn-login.active { 
                    background:#111; color:#fff; 
                    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                }
                .btn-login.active:hover { 
                    background:#E30613; 
                    transform: translateY(-2px);
                    box-shadow: 0 8px 24px rgba(227, 6, 19, 0.25);
                }
                .btn-login.inactive { background:#f5f5f5; color:#bbb; cursor:not-allowed; }

                .login-help { text-align:center; font-size:14px; color:#666; margin-top: 24px; }
                .login-help span { color:#E30613; font-weight:700; cursor:pointer; text-decoration: underline; text-underline-offset: 4px; }

                @keyframes slideUp {
                    from { opacity:0; transform:translateY(30px); }
                    to   { opacity:1; transform:translateY(0); }
                }

                /* ── MOBILE ── */
                @media (max-width: 1024px) {
                    .login-left { flex: 0 0 45%; padding: 60px 40px; }
                }

                @media (max-width: 768px) {
                    .login-root { flex-direction: column; height: auto; min-height: 100vh; }
                    .login-left {
                        flex: none; width: 100%; padding: 60px 24px;
                        align-items: center; text-align: center;
                    }
                    .login-left::after { width: 100%; height: 4px; top: 0; left: 0; }
                    .login-brand { margin-bottom: 32px; justify-content: center; }
                    .login-headline { margin-bottom: 32px; }
                    .login-headline h1 { font-size: 36px; }
                    .cv-list { max-width: 100%; }
                    .cv-card:hover { transform: translateY(-4px); }
                    .login-footer { display: none; }
                    
                    .login-right { flex: 1; padding: 48px 24px; }
                    .login-back { top: 16px; left: 16px; }
                }
            `}</style>

            <div className="login-root">

                {/* ── LEFT ── */}
                <div className="login-left">

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
                                    <div className="cv-icon" style={{ background: cv.bg }}>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={cv.img} alt={cv.title} style={{ width: 26, height: 26, objectFit: "contain" }} />
                                    </div>
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
