"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, AlertTriangle, ArrowRight, ShieldCheck, Clock } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function DowntimeReminderPopup() {
    const [isVisible, setIsVisible] = useState(false);
    const [isHovered, setIsHovered] = useState(false);

    useEffect(() => {
        // Check if the user has already seen the popup today
        const lastSeen = localStorage.getItem("downtimePopupLastSeen");
        const today = new Date().toDateString();

        if (lastSeen !== today) {
            // Slight delay to allow the page to load before popping up, maximizing the aesthetic effect
            const timer = setTimeout(() => {
                setIsVisible(true);
            }, 1500);
            return () => clearTimeout(timer);
        }
    }, []);

    const handleClose = () => {
        setIsVisible(false);
        localStorage.setItem("downtimePopupLastSeen", new Date().toDateString());
    };

    return (
        <AnimatePresence>
            {isVisible && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 pointer-events-none">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm pointer-events-auto"
                        onClick={handleClose}
                    />

                    {/* Popup Card */}
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.95, opacity: 0, y: 10 }}
                        transition={{ type: "spring", damping: 25, stiffness: 300 }}
                        className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden pointer-events-auto border border-white/50"
                        onMouseEnter={() => setIsHovered(true)}
                        onMouseLeave={() => setIsHovered(false)}
                    >
                        {/* Decorative Top Gradient */}
                        <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 opacity-10 blur-2xl" />
                        
                        {/* Close Button */}
                        <button
                            onClick={handleClose}
                            className="absolute top-4 right-4 p-2 rounded-full bg-slate-100/50 text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-all z-10"
                            aria-label="Close"
                        >
                            <X className="w-4 h-4" />
                        </button>

                        <div className="p-8 pb-6 relative z-10">
                            {/* Icon Header */}
                            <div className="flex justify-center mb-6">
                                <div className="relative">
                                    <div className="absolute inset-0 bg-blue-400 blur-xl opacity-20 rounded-full" />
                                    <div className="relative bg-gradient-to-tr from-blue-50 to-indigo-50 p-4 rounded-2xl shadow-inner border border-blue-100">
                                        <ShieldCheck className="w-10 h-10 text-blue-600" strokeWidth={1.5} />
                                    </div>
                                    <motion.div 
                                        animate={{ rotate: 360 }}
                                        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                                        className="absolute -top-2 -right-2 bg-amber-100 p-1.5 rounded-full shadow-sm border border-amber-200"
                                    >
                                        <Clock className="w-4 h-4 text-amber-600" />
                                    </motion.div>
                                </div>
                            </div>

                            {/* Content */}
                            <div className="text-center space-y-3">
                                <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-800 to-slate-600">
                                    Chúc bạn một ngày an toàn!
                                </h2>
                                <p className="text-slate-500 text-sm leading-relaxed px-2">
                                    Dữ liệu Sự cố (Downtime) rất quan trọng để hệ thống tự động tính toán chính xác. Bạn có thời gian dừng máy nào cần báo cáo hôm nay không?
                                </p>
                            </div>

                            {/* Actions */}
                            <div className="mt-8 space-y-3">
                                <Button 
                                    asChild 
                                    className="w-full relative overflow-hidden group bg-slate-900 hover:bg-slate-800 text-white rounded-xl h-12 text-sm font-medium transition-all shadow-lg shadow-slate-900/20"
                                >
                                    <Link href="/downtime" onClick={handleClose}>
                                        <span className="relative z-10 flex items-center justify-center gap-2">
                                            <AlertTriangle className="w-4 h-4 text-amber-400" />
                                            Nhập Downtime Ngay
                                            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                        </span>
                                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-shimmer" />
                                    </Link>
                                </Button>
                                
                                <Button 
                                    variant="ghost" 
                                    onClick={handleClose}
                                    className="w-full text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-xl h-11 text-sm font-medium"
                                >
                                    Không, mọi thứ vẫn ổn định
                                </Button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
