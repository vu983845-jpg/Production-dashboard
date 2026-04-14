"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { format, parseISO, startOfYear, endOfYear, getYear } from "date-fns";
import {
    LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
    ResponsiveContainer, Legend, LabelList, Cell
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

export function OpexReportTab() {
    const supabase = createClient();
    const [loading, setLoading] = useState(true);
    const [yearlyData, setYearlyData] = useState<any[]>([]);

    useEffect(() => {
        async function fetchYearlyData() {
            setLoading(true);
            try {
                // Fetch energy data (for Scope 1 & 2)
                const { data: eData } = await supabase
                    .from("daily_energy")
                    .select("work_date, electricity_kwh, water_m3, wood_kg")
                    .gte("work_date", "2021-01-01")
                    .lte("work_date", "2025-12-31");

                // Fetch production data
                // In dashboard/page.tsx, total RCN is fetched from v_dashboard_total_daily
                const { data: pData } = await supabase
                    .from("v_dashboard_total_daily")
                    .select("work_date, total_actual_ton")
                    .gte("work_date", "2021-01-01")
                    .lte("work_date", "2025-12-31");

                // Aggregate by year
                const yearMap: Record<number, {
                    year: number;
                    rcnKg: number;
                    scope1kg: number;
                    scope2kg: number;
                }> = {};

                [2021, 2022, 2023, 2024, 2025].forEach(y => {
                    yearMap[y] = { year: y, rcnKg: 0, scope1kg: 0, scope2kg: 0 };
                });

                if (pData) {
                    pData.forEach((row: any) => {
                        if (!row.work_date || !row.total_actual_ton) return;
                        const y = getYear(new Date(row.work_date));
                        if (yearMap[y]) {
                            yearMap[y].rcnKg += Number(row.total_actual_ton) * 1000;
                        }
                    });
                }

                if (eData) {
                    eData.forEach((row: any) => {
                        if (!row.work_date) return;
                        const y = getYear(new Date(row.work_date));
                        if (yearMap[y]) {
                            const elec = Number(row.electricity_kwh || 0);
                            const water = Number(row.water_m3 || 0);
                            const wood = Number(row.wood_kg || 0);

                            // According to dashboard logic:
                            // Scope 1: Wood (tons -> * 0.028) + Wastewater (Water * 0.6 -> * 0.201)
                            // Note: wood might be in kg in DB, but the comment says (tons -> * 0.028)
                            // If wood is stored in kg but formula assumes tons:
                            const scope1 = ((wood / 1000) * 0.028 * 1000) + (water * 0.6 * 0.201 * 1000); 
                            // wait, in dashboard: (wood * 0.028) + (water * 0.6 * 0.201); then divided by 1000 to get Tons.
                            // So (wood * 0.028) is kg CO2.
                            const scope1kg = (wood * 0.028) + (water * 0.6 * 0.201);
                            
                            // Scope 2: Electricity (kWh -> * 0.6592) in kg CO2
                            const scope2kg = elec * 0.6592;

                            yearMap[y].scope1kg += scope1kg;
                            yearMap[y].scope2kg += scope2kg;
                        }
                    });
                }

                const finalData = Object.values(yearMap).sort((a, b) => a.year - b.year).map(d => {
                    const totalCo2 = d.scope1kg + d.scope2kg;
                    const intensityS1 = d.rcnKg > 0 ? d.scope1kg / d.rcnKg : 0;
                    const intensityS2 = d.rcnKg > 0 ? d.scope2kg / d.rcnKg : 0;
                    const totalIntensity = intensityS1 + intensityS2;

                    return {
                        year: String(d.year),
                        rcnKg: d.rcnKg,
                        rcnDisplay: d.rcnKg > 0 ? d.rcnKg : null,
                        intensityS1: Number(intensityS1.toFixed(2)),
                        intensityS2: Number(intensityS2.toFixed(2)),
                        totalIntensity: Number(totalIntensity.toFixed(2)),
                    };
                });

                setYearlyData(finalData);
            } catch (err) {
                console.error("Error fetching Opex data", err);
            } finally {
                setLoading(false);
            }
        }

        fetchYearlyData();
    }, [supabase]);

    const renderChartGroup = (title: string, data: any[], isTotalColumn: boolean = false) => {
        // Find max values for static domains
        const maxRcn = Math.max(...data.map(d => d.rcnKg)) * 1.2;
        
        return (
            <div className="flex flex-col border border-slate-200 bg-white rounded-md overflow-hidden min-w-[250px] flex-1">
                {/* Header */}
                <div className={`text-center py-2 font-bold text-white ${isTotalColumn ? 'bg-[#991b1b]' : 'bg-[#991b1b]'}`}>
                    {title}
                </div>
                
                {/* Top Chart: RCN Production (Line) */}
                <div className="p-2 border-b border-slate-100 flex-1 flex flex-col items-center relative">
                    <p className="text-xs font-bold text-slate-700 mb-2">RCN Production (kg)</p>
                    <div className="w-full h-[150px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={data} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} domain={[0, maxRcn > 0 ? maxRcn : 200]} />
                                <Line 
                                    type="monotone" 
                                    dataKey="rcnDisplay" 
                                    stroke="#991b1b" 
                                    strokeWidth={2} 
                                    dot={{ r: 4, fill: "white", stroke: "#991b1b", strokeWidth: 2 }} 
                                    isAnimationActive={false}
                                >
                                    <LabelList dataKey="rcnDisplay" position="top" formatter={(val: any) => val ? val.toLocaleString() : ''} style={{ fontSize: 10, fill: '#334155', fontWeight: 600 }} offset={8} />
                                </Line>
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                    {/* Y-axis label rotated */}
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 -rotate-90 text-[10px] font-semibold text-slate-800 tracking-wider">
                        RCN (kg)
                    </div>
                </div>

                {/* Bottom Chart: CO2 Intensity (Stacked Bar) */}
                <div className="p-2 flex-1 flex flex-col items-center relative bg-slate-50 border-b border-light">
                    <p className="text-xs font-bold text-slate-700 mb-2">CO₂ Intensity (kg CO₂ / kg RCN)</p>
                    <div className="w-full h-[220px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data} margin={{ top: 25, right: 10, left: -20, bottom: 0 }}>
                                <XAxis dataKey="year" axisLine={true} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} stroke="#cbd5e1" />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                                
                                <Bar dataKey="intensityS2" stackId="a" fill="#cbd5e1" isAnimationActive={false}>
                                    <LabelList dataKey="totalIntensity" position="top" style={{ fontSize: 11, fill: '#0f172a', fontWeight: 'bold' }} formatter={(val: any) => val > 0 ? val.toFixed(2) : ''} />
                                    <LabelList dataKey="intensityS2" position="center" style={{ fontSize: 10, fill: '#334155', fontWeight: 600 }} formatter={(val: any) => val > 0 ? val.toFixed(2) : ''} />
                                </Bar>
                                <Bar dataKey="intensityS1" stackId="a" fill="#991b1b" isAnimationActive={false}>
                                    {/* S1 label */}
                                    <LabelList dataKey="intensityS1" position="center" style={{ fontSize: 10, fill: 'white', fontWeight: 600 }} formatter={(val: any) => val > 0 ? val.toFixed(1) : ''} />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    {/* Y-axis label rotated */}
                    <div className="absolute left-0 top-[40%] -translate-y-1/2 -rotate-90 text-[10px] font-semibold text-slate-800 tracking-wider">
                        kg CO₂ / kg RCN
                    </div>
                </div>
            </div>
        );
    };

    if (loading) {
        return (
            <div className="w-full h-[400px] flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm text-slate-500 font-medium animate-pulse">Loading OPEX & GHG data...</p>
            </div>
        );
    }

    // Since we only have data for 1 factory in this DB, we will render it fully for "Long An" 
    // and show empty charts for the others to match the requested 5-column layout.
    const emptyData = [2021, 2022, 2023, 2024, 2025].map(y => ({
        year: String(y), rcnKg: 0, rcnDisplay: null, intensityS1: 0, intensityS2: 0, totalIntensity: 0
    }));

    return (
        <div className="w-full space-y-4 animate-in fade-in duration-500">
            {/* Title */}
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl md:text-2xl font-black text-slate-800 tracking-tight">
                    CO₂ Intensity & RCN Production Trend (2021–2025):<br/>
                    <span className="text-lg font-bold text-slate-600">Scope 1 & Scope 2 — by Factory and Total</span>
                </h2>
            </div>

            {/* Grid of Columns */}
            <div className="flex flex-nowrap overflow-x-auto gap-2 pb-4 snap-x">
                {/* Usually this system is deployed for Long An, use real data here */}
                {renderChartGroup("Long An", yearlyData)}
                {/* Mock empty for the rest unless future multi-factory data is implemented */}
                {renderChartGroup("Phan Thiet", emptyData)}
                {renderChartGroup("Tay Ninh", emptyData)}
                {renderChartGroup("Tuticorin", emptyData)}
                {/* Total = Long An + Others (which are 0) so it's the same as Long An for now */}
                {renderChartGroup("Total - All Factories", yearlyData, true)}
            </div>

            {/* Legend / Footer */}
            <div className="mt-4 bg-slate-50 border border-slate-200 p-4 rounded-lg">
                <p className="font-bold text-sm text-slate-800 uppercase tracking-widest mb-1">
                    Scope Definition:
                </p>
                <div className="flex flex-col md:flex-row gap-6 text-sm text-slate-600">
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-[#991b1b] rounded-sm"></div>
                        <span><strong>Scope 1 (Dark Red):</strong> Direct emissions from on-site fuel combustion (e.g., boiler fuel, firewood/biomass, diesel, LPG, company vehicles).</span>
                    </div>
                </div>
                <div className="flex flex-col md:flex-row gap-6 text-sm text-slate-600 mt-2">
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-[#cbd5e1] rounded-sm"></div>
                        <span><strong>Scope 2 (Light Gray):</strong> Indirect emissions from purchased electricity consumed by the factory.</span>
                    </div>
                </div>
                <p className="text-xs text-slate-400 mt-4">
                    CO₂ intensity calculated as kg CO₂ per kg RCN. Scope 1 = direct fuel combustion | Scope 2 = purchased electricity only.
                </p>
            </div>
        </div>
    );
}
