"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { NeutralLogo } from "@/components/neutral-logo";
import { ArrowLeft, Leaf, Rocket, Users, TrendingUp } from "lucide-react";
import Link from "next/link";



const CORE_VALUES = [
    { img: "/cv-thinking.svg", bg: "#6B8C2A", title: "Plan Clearly",     desc: "Đặt trách nhiệm lên hàng đầu trong mọi quyết định" },
    { img: "/cv-acting.svg",   bg: "#C8102E", title: "Act Quickly", desc: "Tinh thần khởi nghiệp — sáng tạo và chủ động" },
    { img: "/cv-growing.svg",  bg: "#D4A017", title: "Work Together",          desc: "Cùng nhau phát triển, tin tưởng và minh bạch" },
    { img: "/cv-acting.svg",   bg: "#7C3AED", title: "Improve Daily",      desc: "Xuất sắc trong công việc với niềm đam mê" },
];

function getAuthErrorMessage(message: string): string {
    const msg = message.toLowerCase();
    if (msg.includes("invalid login credentials") || msg.includes("invalid credentials")) {
        return "Incorrect password — please try again.\nMật khẩu không đúng — vui lòng thử lại.";
    }
    if (msg.includes("email not confirmed")) {
        return "Email not verified. Please check your inbox.\nEmail chưa được xác minh. Vui lòng kiểm tra hộp thư.";
    }
    if (msg.includes("too many requests") || msg.includes("rate limit")) {
        return "Too many failed attempts. Please wait and try again.\nQuá nhiều lần thử. Vui lòng đợi và thử lại sau.";
    }
    if (msg.includes("user not found")) {
        return "Account not found. Please check your email.\nKhông tìm thấy tài khoản. Vui lòng kiểm tra email.";
    }
    if (msg.includes("captcha")) {
        return "CAPTCHA verification failed. Please try again.\nXác minh CAPTCHA thất bại. Vui lòng thử lại.";
    }
    // Fallback: show original
    return message;
}

export default function LoginPage() {
    const [email, setEmail]           = useState("");
    const [password, setPassword]     = useState("");
    const [loading, setLoading]       = useState(false);
    const [mounted, setMounted]       = useState(false);
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
            email, password,
        });
        if (error) {
            toast.error(getAuthErrorMessage(error.message), { duration: 5000, style: { whiteSpace: "pre-line" } });
            setLoading(false);
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
                    background: #fcf9f8;
                    position: relative;
                }

                /* ── BACKGROUND ── */
                .login-bg {
                    position: absolute;
                    inset: 0;
                    z-index: 0;
                }
                .login-bg img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    opacity: 0.8;
                }
                .login-bg::after {
                    content: '';
                    position: absolute;
                    inset: 0;
                    background: linear-gradient(135deg, rgba(252,249,248,0.9) 0%, rgba(252,249,248,0.4) 50%, rgba(252,249,248,0.95) 100%);
                }

                /* ── LEFT PANEL: Authentic Corporate Light ── */
                .login-left {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: flex-start;
                    padding: 80px 10%;
                    position: relative;
                    z-index: 1;
                }

                .login-brand {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    margin-bottom: 80px;
                }
                .login-brand-logo {
                    background: #fff;
                    width: 52px;
                    height: 52px;
                    border-radius: 12px;
                    overflow: hidden;
                    display: flex;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.05);
                }
                .login-brand-logo img {
                    border-radius: 12px;
                }
                .login-brand-name  { color:#1A1A1A; font-weight:800; font-size:24px; letter-spacing:-0.5px; }
                .login-brand-sub   { color:#5e3f3b; font-size:13px; font-weight:500; letter-spacing: 0.5px; }

                .login-headline { 
                    margin-bottom: 60px; 
                    max-width: 600px;
                }
                .login-headline-label {
                    color:#0EA5E9; font-size:12px; font-weight:700;
                    letter-spacing: 0.2em; text-transform:uppercase; margin-bottom:16px;
                    display: inline-block;
                    position: relative;
                }
                .login-headline-label::after {
                    content: '';
                    position: absolute;
                    top: 50%;
                    left: 100%;
                    transform: translateY(-50%);
                    width: 40px;
                    height: 2px;
                    background: #0EA5E9;
                    margin-left: 12px;
                    border-radius: 2px;
                    box-shadow: 0 0 8px rgba(227, 6, 19, 0.4);
                    animation: pulseDigital 2s infinite alternate;
                }
                @keyframes pulseDigital {
                    0% { width: 20px; box-shadow: 0 0 4px rgba(227, 6, 19, 0.2); }
                    100% { width: 60px; box-shadow: 0 0 12px rgba(227, 6, 19, 0.6); }
                }
                .login-headline h1 {
                    color:#1A1A1A; font-weight:800; font-size: 56px;
                    line-height:1.05; margin:0; letter-spacing:-0.03em;
                }
                .login-headline h1 em { font-style:normal; color: #5e3f3b; font-weight:300; display:block; }

                .cv-list { 
                    display:grid; grid-template-columns: repeat(2, 1fr); gap:16px; 
                    width:100%; max-width:600px; z-index:2; 
                }
                .cv-card {
                    display:flex; align-items:center; gap:16px;
                    background: rgba(255, 255, 255, 0.85);
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    border: 1px solid rgba(0, 0, 0, 0.04);
                    border-radius: 12px;
                    padding: 20px;
                    opacity:0;
                    animation: fadeUp 0.8s cubic-bezier(0.22, 1, 0.36, 1) forwards;
                    transition: all .3s ease;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.02);
                }
                .cv-card:hover { 
                    background: #ffffff; 
                    border-color: rgba(227, 6, 19, 0.2);
                    transform: translateY(-4px); 
                    box-shadow: 0 12px 32px rgba(0,0,0,0.08);
                }

                .cv-card:nth-child(1) { animation-delay:.1s; }
                .cv-card:nth-child(2) { animation-delay:.2s; }
                .cv-card:nth-child(3) { animation-delay:.3s; }
                .cv-card:nth-child(4) { animation-delay:.4s; }

                .cv-icon {
                    width:48px; height:48px; flex-shrink:0;
                    display:flex; align-items:center; justify-content:center;
                    background:#f6f3f2; border-radius:50%;
                    color: #0EA5E9;
                    font-size: 20px;
                }
                .cv-title { color:#1A1A1A; font-weight:700; font-size:14px; margin-bottom: 4px; letter-spacing: -0.01em; }
                .cv-desc  { color:#5e3f3b; font-size:12px; line-height:1.5; }

                /* ── RIGHT PANEL: The Form Overlay ── */
                .login-right {
                    flex: 0 0 480px;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    padding: 80px 60px;
                    position: relative;
                    z-index: 2;
                }
                .login-right::before {
                    content: '';
                    position: absolute;
                    inset: 0;
                    background: #ffffff;
                    border-left: 1px solid rgba(0,0,0,0.05);
                    box-shadow: -20px 0 60px rgba(0,0,0,0.03);
                    z-index: -1;
                }

                .login-back {
                    position:absolute; top:40px; left:40px;
                    display:flex; align-items:center; gap:8px;
                    color:#5e3f3b; font-size:13px; text-decoration:none;
                    font-weight:600; transition:all .2s;
                    letter-spacing: 0.05em; text-transform: uppercase;
                }
                .login-back:hover { color:#0EA5E9; }

                .login-form-wrap { width:100%; max-width: 360px; }

                .login-form-title {
                    font-size:32px; font-weight:800; color:#1A1A1A;
                    margin:0 0 8px; letter-spacing:-0.02em;
                }
                .login-form-sub { color:#5e3f3b; font-size:15px; margin:0 0 48px; font-weight: 400; line-height: 1.6; }

                .field-group { display:flex; flex-direction:column; gap:24px; }
                .field { display:flex; flex-direction:column; gap:10px; position: relative; }
                .field label { color:#1A1A1A; font-size:12px; font-weight:700; text-transform: uppercase; letter-spacing: 0.1em; }

                .field input {
                    border: none;
                    border-bottom: 1px solid #e9bcb6; /* Ghost Border */
                    padding: 12px 0;
                    font-size:16px;
                    font-family:inherit;
                    transition: all .3s ease;
                    outline:none;
                    width:100%;
                    background: transparent;
                    color: #1A1A1A;
                }
                .field input::placeholder { color: #a09d9c; }
                .field input:focus { border-bottom-color: #0EA5E9; border-width: 2px; }



                .btn-login {
                    width:100%; padding:18px;
                    border-radius: 8px; border:none;
                    font-weight:700; font-size:15px;
                    cursor:pointer; font-family:inherit;
                    letter-spacing: 0.03em; text-transform: uppercase;
                    transition: all .4s cubic-bezier(0.22, 1, 0.36, 1);
                    margin-top: 16px;
                }
                .btn-login.active { 
                    background: #0EA5E9;
                    color:#fff; 
                    box-shadow: 0 4px 12px rgba(227, 6, 19, 0.2);
                }
                .btn-login.active:hover { 
                    background: #b5000b;
                    box-shadow: 0 12px 24px rgba(227, 6, 19, 0.3);
                    transform: translateY(-2px);
                }
                .btn-login.inactive { background:#eae7e7; color:#a09d9c; cursor:not-allowed; }

                .login-help { text-align:center; font-size:14px; color:#5e3f3b; margin-top: 32px; }
                .login-help span { color:#0EA5E9; font-weight:700; cursor:pointer; text-decoration: none; border-bottom: 1px solid #0EA5E9; padding-bottom: 2px; }

                @keyframes fadeUp {
                    from { opacity:0; transform:translateY(40px); }
                    to   { opacity:1; transform:translateY(0); }
                }

                /* ── MOBILE ── */
                @media (max-width: 1024px) {
                    .login-left { padding: 60px 5%; }
                    .login-headline h1 { font-size: 42px; }
                    .cv-list { grid-template-columns: 1fr; }
                    .login-right { flex: 0 0 420px; padding: 60px 40px; }
                }

                @media (max-width: 768px) {
                    .login-root { flex-direction: column; overflow: auto; }
                    .login-bg::after { background: rgba(252,249,248,0.9); }
                    .login-left {
                        flex: none; width: 100%; padding: 48px 24px;
                        align-items: center; text-align: center;
                    }
                    .login-brand { justify-content: center; margin-bottom: 40px; }
                    .login-headline h1 { font-size: 36px; }
                    .login-headline-label { margin-bottom: 12px; }
                    .login-headline-label::after { display: none; }
                    .cv-list { display: none; }
                    
                    .login-right { 
                        flex: none; width: 100%; padding: 48px 24px;
                        border-radius: 24px 24px 0 0;
                        box-shadow: 0 -10px 40px rgba(0,0,0,0.1);
                    }
                    .login-right::before { border-left: none; border-top: 1px solid rgba(0,0,0,0.05); border-radius: 24px 24px 0 0; }
                    .login-back { display: none; }
                }
            `}</style>

            <div className="login-root">
                <div className="login-bg">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/assets/digital-cashew-bg.png" alt="Operations workspace" />
                </div>

                {/* ── LEFT ── */}
                <div className="login-left">
                    <div className="login-brand">
                        <div className="login-brand-logo">
                            <NeutralLogo className="w-full h-full" />
                        </div>
                        <div>
                            <div className="login-brand-name">Operations Portal</div>
                            <div className="login-brand-sub">Metrics & Reporting</div>
                        </div>
                    </div>

                    <div className="login-headline">
                        <div className="login-headline-label">Operational Intelligence</div>
                        <h1>
                            Simple, focused metrics <em>for daily operations.</em>
                        </h1>
                    </div>

                    <div className="cv-list">
                        <div className="cv-card">
                            <div className="cv-icon"><Leaf size={24} /></div>
                            <div>
                                <div className="cv-title">Plan Clearly</div>
                                <div className="cv-desc">Make daily work visible and consistent</div>
                            </div>
                        </div>
                        <div className="cv-card">
                            <div className="cv-icon"><Rocket size={24} /></div>
                            <div>
                                <div className="cv-title">Act Quickly</div>
                                <div className="cv-desc">Capture issues early and respond faster</div>
                            </div>
                        </div>
                        <div className="cv-card">
                            <div className="cv-icon"><Users size={24} /></div>
                            <div>
                                <div className="cv-title">Work Together</div>
                                <div className="cv-desc">Keep teams aligned with shared numbers</div>
                            </div>
                        </div>
                        <div className="cv-card">
                            <div className="cv-icon"><TrendingUp size={24} /></div>
                            <div>
                                <div className="cv-title">Improve Daily</div>
                                <div className="cv-desc">Track progress and reduce manual follow-up</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── RIGHT ── */}
                <div className="login-right">
                    <Link href="/downtime" className="login-back">
                        <ArrowLeft size={16} strokeWidth={2.5} /> Quản lý Downtime
                    </Link>

                    <div className="login-form-wrap">
                        <h2 className="login-form-title">Đăng nhập</h2>
                        <p className="login-form-sub">Chào mừng trở lại! Vui lòng nhập thông tin.</p>

                        <form onSubmit={handleLogin} className="field-group">
                            <div className="field">
                                <label>Email</label>
                                <input
                                    type="email"
                                    placeholder="m@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                />
                            </div>

                            <div className="field">
                                <label>Mật khẩu</label>
                                <input
                                    type="password"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className={`btn-login ${!loading ? "active" : "inactive"}`}
                            >
                                {loading ? "Đang xử lý..." : "Vào trang quản trị"}
                            </button>
                        </form></div>
                </div>
            </div>
        </>
    );
}
