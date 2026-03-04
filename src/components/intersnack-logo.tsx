import React from 'react';

export function IntersnackLogo({ className = "" }: { className?: string }) {
    // A simplified, purely CSS/SVG representation inspired by the Intersnack logo (red rounded square with white stylized clover/tree)
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 100 100"
            className={className}
            fill="none"
        >
            <rect x="5" y="5" width="90" height="90" rx="20" fill="#E31818" />
            <path
                d="M50 95 C 50 70, 45 55, 50 50 C 40 50, 20 60, 25 45 C 30 30, 45 45, 50 50 C 45 40, 35 20, 50 25 C 65 20, 55 40, 50 50 C 55 45, 70 30, 75 45 C 80 60, 60 50, 50 50 C 55 55, 50 70, 50 95"
                fill="none"
                stroke="white"
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path
                d="M50 95 C 50 70, 45 55, 50 50 C 40 50, 20 60, 25 45 C 30 30, 45 45, 50 50 C 45 40, 35 20, 50 25 C 65 20, 55 40, 50 50 C 55 45, 70 30, 75 45 C 80 60, 60 50, 50 50 C 55 55, 50 70, 50 95"
                fill="white"
            />
        </svg>
    )
}
