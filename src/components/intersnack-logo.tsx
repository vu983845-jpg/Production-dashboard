import React from 'react';
import Image from 'next/image';

export function IntersnackLogo({ className = "" }: { className?: string }) {
    return (
        <div className={`relative ${className}`}>
            <Image
                src="/assets/intersnack-custom.jpg"
                alt="Intersnack Logo"
                fill
                style={{ objectFit: "contain" }}
                priority
            />
        </div>
    )
}
