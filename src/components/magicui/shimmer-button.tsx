'use client';

import React, { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

interface ShimmerButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  shimmerColor?: string;
  shimmerSize?: string;
  borderRadius?: string;
  shimmerDuration?: string;
  background?: string;
  children: React.ReactNode;
}

/**
 * ShimmerButton — nút bấm có hiệu ứng ánh sáng lướt qua.
 * Cực đẹp cho các nút hành động quan trọng (Submit, Export, v.v.)
 */
export function ShimmerButton({
  shimmerColor = '#ffffff',
  shimmerSize = '0.05em',
  shimmerDuration = '2.5s',
  borderRadius = '8px',
  background = 'linear-gradient(135deg, #dc2626, #b91c1c)',
  className,
  children,
  ...props
}: ShimmerButtonProps) {
  return (
    <button
      style={
        {
          '--shimmer-color': shimmerColor,
          '--shimmer-size': shimmerSize,
          '--shimmer-duration': shimmerDuration,
          '--border-radius': borderRadius,
          '--background': background,
        } as CSSProperties
      }
      className={cn(
        'group relative flex cursor-pointer items-center justify-center overflow-hidden whitespace-nowrap px-6 py-2.5 text-white [background:var(--background)] [border-radius:var(--border-radius)]',
        'transition-all duration-300 hover:scale-105 hover:shadow-lg active:scale-95',
        // shimmer effect
        'before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_var(--shimmer-duration)_infinite]',
        'before:bg-gradient-to-r before:from-transparent before:via-[var(--shimmer-color)]/20 before:to-transparent',
        className
      )}
      {...props}
    >
      {children}
      <style>{`
        @keyframes shimmer {
          100% { transform: translateX(200%); }
        }
      `}</style>
    </button>
  );
}
