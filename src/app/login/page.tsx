"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { IntersnackLogo } from "@/components/intersnack-logo";
import { ArrowLeft, Leaf, Rocket, Users, TrendingUp } from "lucide-react";
import Link from "next/link";
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
                    color:#E30613; font-size:12px; font-weight:700;
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
                    background: #E30613;
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
                    color: #E30613;
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
                .login-back:hover { color:#E30613; }

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
                .field input:focus { border-bottom-color: #E30613; border-width: 2px; }

                .captcha-wrap { display:flex; justify-content:center; margin-top: 10px; }

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
                    background: #E30613;
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
                .login-help span { color:#E30613; font-weight:700; cursor:pointer; text-decoration: none; border-bottom: 1px solid #E30613; padding-bottom: 2px; }

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
                    <img src="/assets/digital-cashew-bg.png" alt="Intersnack Premium Cashew Facility" />
                </div>

                {/* ── LEFT ── */}
                <div className="login-left">
                    <div className="login-brand">
                        <div className="login-brand-logo">
                            <IntersnackLogo className="w-full h-full" />
                        </div>
                        <div>
                            <div className="login-brand-name">Intersnack</div>
                            <div className="login-brand-sub">VICC LA · Production Dashboard</div>
                        </div>
                    </div>

                    <div className="login-headline">
                        <div className="login-headline-label">Manufacturing Intelligence</div>
                        <h1>
                            Digitizing the future <em>of premium cashews.</em>
                        </h1>
                    </div>

                    <div className="cv-list">
                        <div className="cv-card">
                            <div className="cv-icon"><Leaf size={24} /></div>
                            <div>
                                <div className="cv-title">Thinking Responsibly</div>
                                <div className="cv-desc">Putting responsibility first in all decisions</div>
                            </div>
                        </div>
                        <div className="cv-card">
                            <div className="cv-icon"><Rocket size={24} /></div>
                            <div>
                                <div className="cv-title">Acting Entrepreneurially</div>
                                <div className="cv-desc">Innovative and proactive spirit</div>
                            </div>
                        </div>
                        <div className="cv-card">
                            <div className="cv-icon"><Users size={24} /></div>
                            <div>
                                <div className="cv-title">Growing Together</div>
                                <div className="cv-desc">Developing together with trust</div>
                            </div>
                        </div>
                        <div className="cv-card">
                            <div className="cv-icon"><TrendingUp size={24} /></div>
                            <div>
                                <div className="cv-title">Excellence & Passion</div>
                                <div className="cv-desc">Outstanding work driven by passion</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── RIGHT ── */}
                <div className="login-right">


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
                                    ? "Đang xử lý..."
                                    : !captchaToken
                                    ? "Vui lòng xác minh captcha"
                                    : "Vào trang quản trị"}
                            </button>
                        </form>

                        <div className="login-help">
                            Chưa có tài khoản?{" "}
                            <span onClick={() => alert("Để yêu cầu cấp tài khoản, vui lòng liên hệ Zalo: 0945646999")}>
                                Liên hệ hỗ trợ
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
