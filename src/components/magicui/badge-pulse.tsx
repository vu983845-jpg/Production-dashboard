'use client';

import { cn } from '@/lib/utils';

interface BadgePulseProps {
  label: string;
  color?: 'green' | 'red' | 'yellow' | 'blue';
  className?: string;
}

const colorMap = {
  green:  { dot: 'bg-emerald-400', ping: 'bg-emerald-400/75', text: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-400/20' },
  red:    { dot: 'bg-red-400',     ping: 'bg-red-400/75',     text: 'text-red-400',     bg: 'bg-red-400/10 border-red-400/20'         },
  yellow: { dot: 'bg-amber-400',   ping: 'bg-amber-400/75',   text: 'text-amber-400',   bg: 'bg-amber-400/10 border-amber-400/20'     },
  blue:   { dot: 'bg-blue-400',    ping: 'bg-blue-400/75',    text: 'text-blue-400',    bg: 'bg-blue-400/10 border-blue-400/20'       },
};

/**
 * BadgePulse — badge trạng thái có chấm nhấp nháy (như đèn xanh "Live")
 * Dùng cho trạng thái: Đang chạy / Cảnh báo / Dừng
 */
export function BadgePulse({ label, color = 'green', className }: BadgePulseProps) {
  const c = colorMap[color];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border',
        c.bg, c.text, className
      )}
    >
      <span className="relative flex h-2 w-2">
        <span className={cn('animate-ping absolute inline-flex h-full w-full rounded-full opacity-75', c.ping)} />
        <span className={cn('relative inline-flex rounded-full h-2 w-2', c.dot)} />
      </span>
      {label}
    </span>
  );
}
