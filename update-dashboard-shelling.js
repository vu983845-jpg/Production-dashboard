const fs = require('fs');
const f = 'src/app/(protected)/dashboard/page.tsx';
let c = fs.readFileSync(f, 'utf8');

// ── 1. Add shellingLineMonthData fetch inside fetchDashboard ──────────────────
// Find the right spot: right before the closing of fetchDashboard
const fetchEnd = `        }
        fetchDashboard()
    }, [selectedDept, selectedMonth])`;

const fetchEndNew = `            // Fetch Shelling Line MTD data
            const { data: shellLineData } = await supabase
                .from('shelling_line_daily')
                .select('line_code, actual_ton, run_hours')
                .gte('work_date', startFilter)
                .lte('work_date', endFilter)

            if (shellLineData) {
                const agg: Record<string, { actual_ton: number; run_hours: number }> = {}
                shellLineData.forEach((r: any) => {
                    if (!agg[r.line_code]) agg[r.line_code] = { actual_ton: 0, run_hours: 0 }
                    agg[r.line_code].actual_ton += Number(r.actual_ton || 0)
                    agg[r.line_code].run_hours += Number(r.run_hours || 0)
                })
                setShellingLineMonthData(agg)
            }
        }
        fetchDashboard()
    }, [selectedDept, selectedMonth])`;

if (c.includes(fetchEnd)) {
    c = c.replace(fetchEnd, fetchEndNew);
    console.log('✓ Added shelling line fetch');
} else {
    console.log('⚠ fetchEnd marker not found');
}

// ── 2. Replace the sparkline chart block with toggle + conditional render ──────
const sparklineOld = `                    {/* Sparkline chart */}
                    <div className="h-36 w-full mt-auto border-t pt-2">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={displayHistory} margin={{ top: 5, right: 0, left: 0, bottom: 25 }}>
                                <XAxis dataKey="name" tick={{ fontSize: 10, dy: 5 }} tickLine={false} axisLine={false} height={30} minTickGap={10} tickMargin={5} />
                                <Tooltip contentStyle={{ fontSize: '10px', padding: '2px 4px' }} cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
                                {id === 'virtual-container' && !isReached && Number(dailyNeeded) > 0 && remainingDays > 0 && (
                                    <Line type="step" dataKey="DailyNeeded" stroke="#10b981" strokeDasharray="3 3" dot={false} strokeWidth={2} name="C\u1ea7n l\u00e0m/Ng\u00e0y" connectNulls={false} />
                                )}
                                {deptCode === "SHELL" && (
                                    <>
                                        <YAxis yAxisId="intensity" orientation="right" hide />
                                        <Line yAxisId="intensity" type="monotone" dataKey="Intensity" stroke="#f59e0b" dot={false} strokeWidth={2} name="kWh/T" />
                                    </>
                                )}
                                <Bar dataKey="Actual" name="Th\u1ef1c t\u1ebf" radius={[2, 2, 0, 0]}>
                                    {displayHistory.map((entry: any, index: number) => {
                                        const color = (entry.Plan > 0 && entry.Actual < entry.Plan) ? "#ef4444" : "#22c55e";
                                        return <Cell key={`cell-${index}`} fill={color} />;
                                    })}
                                </Bar>
                                <Line type="step" dataKey="Plan" stroke="#94a3b8" strokeDasharray="3 3" dot={false} strokeWidth={1} name="K\u1ebf ho\u1ea1ch" />
                                {deptCode === "ALL" && (
                                    <>
                                        <YAxis yAxisId="emission" orientation="right" hide />
                                        <Line yAxisId="emission" type="monotone" dataKey="Emission" stroke="#ef4444" dot={true} strokeWidth={2} name="Ph\u00e1t th\u1ea3i (T CO\u2082e)" />
                                    </>
                                )}
                                <Legend verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: '9px', paddingTop: '5px' }} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>`;

const sparklineNew = `                    {/* Toggle for SHELL overview vs line view */}
                    {deptCode === "SHELL" && (
                        <div className="flex items-center gap-1.5 mb-2 mt-1">
                            <span className="text-[10px] text-muted-foreground">Ch\u1ebf \u0111\u1ed9:</span>
                            <button onClick={() => setShellingViewMode('overview')}
                                className={\`text-[10px] px-2 py-0.5 rounded-full border transition-all \${shellingViewMode === 'overview' ? 'bg-primary text-white border-primary font-semibold' : 'border-gray-300 text-muted-foreground hover:border-primary'}\`}>
                                Overview
                            </button>
                            <button onClick={() => setShellingViewMode('lines')}
                                className={\`text-[10px] px-2 py-0.5 rounded-full border transition-all \${shellingViewMode === 'lines' ? 'bg-primary text-white border-primary font-semibold' : 'border-gray-300 text-muted-foreground hover:border-primary'}\`}>
                                Theo Line
                            </button>
                        </div>
                    )}
                    {/* Sparkline chart */}
                    {deptCode === "SHELL" && shellingViewMode === 'lines' ? (
                        <div className="w-full mt-auto border-t pt-3 space-y-1.5">
                            {SHELLING_LINES_DASH.map(line => {
                                const lc: Record<string, string> = { A: '#3b82f6', B: '#10b981', C: '#f59e0b', D: '#ef4444', D1: '#8b5cf6' }
                                const ld = shellingLineMonthData[line] || { actual_ton: 0, run_hours: 0 }
                                const eff = ld.run_hours > 0 ? (ld.actual_ton / ld.run_hours).toFixed(2) : '\u2014'
                                const pct = summary.totalActual > 0 ? Math.min(100, (ld.actual_ton / summary.totalActual) * 100) : 0
                                const color = lc[line] || '#64748b'
                                return (
                                    <div key={line} className="flex items-center gap-2">
                                        <span className="text-[10px] font-black w-5 text-center shrink-0" style={{ color }}>{line}</span>
                                        <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                                            <div className="h-full rounded-full transition-all" style={{ width: \`\${pct}%\`, backgroundColor: color }} />
                                        </div>
                                        <span className="text-[10px] font-bold w-11 text-right shrink-0" style={{ color }}>{ld.actual_ton.toFixed(1)}T</span>
                                        <span className="text-[10px] text-muted-foreground w-8 text-right shrink-0">{ld.run_hours.toFixed(0)}h</span>
                                        <span className="text-[10px] font-bold text-emerald-700 w-14 text-right shrink-0">{eff !== '\u2014' ? eff + ' T/h' : '\u2014'}</span>
                                    </div>
                                )
                            })}
                        </div>
                    ) : (
                    <div className="h-36 w-full mt-auto border-t pt-2">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={displayHistory} margin={{ top: 5, right: 0, left: 0, bottom: 25 }}>
                                <XAxis dataKey="name" tick={{ fontSize: 10, dy: 5 }} tickLine={false} axisLine={false} height={30} minTickGap={10} tickMargin={5} />
                                <Tooltip contentStyle={{ fontSize: '10px', padding: '2px 4px' }} cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
                                {id === 'virtual-container' && !isReached && Number(dailyNeeded) > 0 && remainingDays > 0 && (
                                    <Line type="step" dataKey="DailyNeeded" stroke="#10b981" strokeDasharray="3 3" dot={false} strokeWidth={2} name="C\u1ea7n l\u00e0m/Ng\u00e0y" connectNulls={false} />
                                )}
                                {deptCode === "SHELL" && (
                                    <>
                                        <YAxis yAxisId="intensity" orientation="right" hide />
                                        <Line yAxisId="intensity" type="monotone" dataKey="Intensity" stroke="#f59e0b" dot={false} strokeWidth={2} name="kWh/T" />
                                    </>
                                )}
                                <Bar dataKey="Actual" name="Th\u1ef1c t\u1ebf" radius={[2, 2, 0, 0]}>
                                    {displayHistory.map((entry: any, index: number) => {
                                        const color = (entry.Plan > 0 && entry.Actual < entry.Plan) ? "#ef4444" : "#22c55e";
                                        return <Cell key={\`cell-\${index}\`} fill={color} />;
                                    })}
                                </Bar>
                                <Line type="step" dataKey="Plan" stroke="#94a3b8" strokeDasharray="3 3" dot={false} strokeWidth={1} name="K\u1ebf ho\u1ea1ch" />
                                {deptCode === "ALL" && (
                                    <>
                                        <YAxis yAxisId="emission" orientation="right" hide />
                                        <Line yAxisId="emission" type="monotone" dataKey="Emission" stroke="#ef4444" dot={true} strokeWidth={2} name="Ph\u00e1t th\u1ea3i (T CO\u2082e)" />
                                    </>
                                )}
                                <Legend verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: '9px', paddingTop: '5px' }} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                    )}`;

// Normalize to match file (CRLF)
const sparklineOldCRLF = sparklineOld.replace(/\n/g, '\r\n');
const sparklineNewCRLF = sparklineNew.replace(/\n/g, '\r\n');

if (c.includes(sparklineOldCRLF)) {
    c = c.replace(sparklineOldCRLF, sparklineNewCRLF);
    console.log('✓ Replaced sparkline with toggle + line view');
} else if (c.includes(sparklineOld)) {
    c = c.replace(sparklineOld, sparklineNew);
    console.log('✓ Replaced sparkline (LF version)');
} else {
    console.log('⚠ Sparkline marker not found');
}

fs.writeFileSync(f, c, 'utf8');
console.log('Done! File written.');
