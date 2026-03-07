import React from 'react';

/**
 * A reusable half-circle HTML/CSS Gauge Chart
 */
interface GaugeChartProps {
    value: number;       // Current value
    target: number;      // Target or Maximum value
    label: string;       // KPI label (e.g. % Thể hiện)
    unit?: string;       // e.g. T, %, kWh
    color?: string;      // Color for the progress arc, e.g. #3b82f6 (blue)
    height?: number;     // Height in pixels
    formatValue?: (val: number) => string;
}

export function GaugeChart({
    value,
    target,
    label,
    unit = '',
    color = '#10b981', // default emerald-500
    height = 120,
    formatValue
}: GaugeChartProps) {
    // Prevent divide by zero and clamp percentage between 0-100%
    const validTarget = target > 0 ? target : 1;
    const rawPercent = (value / validTarget) * 100;
    const progressPercent = Math.min(Math.max(rawPercent, 0), 100);

    // Geometry of the SVG arc (stroke-dasharray length)
    // For a semi-circle with radius R, the circumference is PI * R
    // Let's use a 100x50 viewBox, Radius = 40 (leaves room for thick stroke)
    const radius = 40;
    const circumference = Math.PI * radius;

    // Calculate the length of the arc based on percentage
    const strokeDasharray = `${(progressPercent / 100) * circumference} ${circumference}`;

    const formattedValue = formatValue
        ? formatValue(value)
        : Number.isInteger(value) ? value.toString() : value.toFixed(1);

    const formattedTarget = formatValue
        ? formatValue(target)
        : Number.isInteger(target) ? target.toString() : target.toFixed(1);

    return (
        <div className="flex flex-col items-center justify-center relative w-full" style={{ height }}>
            {/* SVG implementation of half-circle Gauge */}
            <svg
                viewBox="0 0 100 55"
                className="w-full h-full overflow-visible"
                preserveAspectRatio="xMidYMax meet"
            >
                {/* Background Arc */}
                <path
                    d={`M 10 50 A 40 40 0 0 1 90 50`}
                    fill="none"
                    stroke="#e2e8f0" // slate-200
                    strokeWidth="10"
                    strokeLinecap="round"
                />

                {/* Progress Arc */}
                <path
                    d={`M 10 50 A 40 40 0 0 1 90 50`}
                    fill="none"
                    stroke={color}
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={strokeDasharray}
                    style={{
                        transition: "stroke-dasharray 1s ease-out"
                    }}
                />
            </svg>

            {/* Labels overlay */}
            <div className="absolute inset-x-0 bottom-1 flex flex-col items-center justify-end leading-none">
                <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-foreground tracking-tight">{formattedValue}</span>
                </div>
                {target > 0 && (
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                        Target: {formattedTarget} {unit}
                    </div>
                )}
            </div>

            <div className="absolute top-1 font-semibold text-xs text-muted-foreground text-center line-clamp-1 w-full px-2">
                {label}
            </div>

            <div className="absolute bottom-[-15px] inset-x-0 flex justify-between px-6 text-[9px] text-muted-foreground font-medium">
                <span>0</span>
                <span>{rawPercent.toFixed(1)}%</span>
            </div>
        </div>
    );
}
