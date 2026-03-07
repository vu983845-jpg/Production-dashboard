import React from 'react';
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

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
    inverse?: boolean;   // If true, exceeding target is bad (red arrow). If false, exceeding target is good (green arrow).
}

export function GaugeChart({
    value,
    target,
    label,
    unit = '',
    color = '#10b981', // default emerald-500
    height = 120,
    formatValue,
    inverse = false
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

    // Trend Icon matching logic
    let TrendIcon = Minus;
    let trendColor = "text-muted-foreground";

    if (rawPercent >= 100) {
        TrendIcon = TrendingUp;
        trendColor = inverse ? "text-red-500" : "text-green-500";
    } else if (rawPercent > 0) {
        TrendIcon = TrendingDown;
        trendColor = inverse ? "text-green-500" : "text-amber-500";
    }

    return (
        <div className="flex flex-col sm:flex-row items-center justify-between w-full h-full gap-2 sm:gap-4">
            {/* Labels & Targets */}
            <div className="flex flex-col justify-center items-center sm:items-start flex-1 text-center sm:text-left min-w-0 w-full">
                <div className="font-bold text-[10px] sm:text-xs text-muted-foreground line-clamp-2 leading-tight uppercase tracking-wider">
                    {label}
                </div>
                <div className="flex items-baseline gap-1 mt-1 sm:mt-2 text-sm sm:text-base font-bold text-foreground">
                    <span>{formattedValue}</span>
                    <span className="text-[10px] sm:text-xs text-muted-foreground font-normal">{unit}</span>
                </div>
                <div className="text-[9px] sm:text-[11px] text-muted-foreground font-medium mt-0.5 opacity-80">
                    Mục tiêu: {formattedTarget} {unit}
                </div>
            </div>

            {/* SVG Gauge */}
            <div className="relative w-24 h-16 sm:w-28 sm:h-18 shrink-0 flex flex-col items-center justify-end pb-1 mt-2 sm:mt-0">
                <svg
                    viewBox="0 0 100 55"
                    className="absolute inset-x-0 bottom-0 w-full h-full overflow-visible"
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

                {/* Numbers overlay inside arc */}
                <div className="relative z-10 flex flex-col items-center justify-end leading-none translate-y-1 sm:translate-y-2">
                    <div className={`flex items-baseline gap-0.5 ${trendColor}`}>
                        <span className="text-lg sm:text-xl font-bold tracking-tight">{rawPercent.toFixed(0)}</span>
                        <span className="text-[9px] sm:text-[10px] font-bold">%</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
