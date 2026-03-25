import React from 'react';
import Image from 'next/image';

export function IntersnackLogo({ className = "" }: { className?: string }) {
    return (
        <div className={`relative overflow-hidden rounded-xl bg-white flex items-center justify-center ${className}`}>
            <Image
                src="/assets/intersnack-custom.jpg"
                alt="Intersnack Logo"
                fill
                className="object-contain p-1"
                priority
            />
        </div>
    )
}
