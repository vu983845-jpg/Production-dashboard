const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/app/(protected)/dashboard/page.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add toggle button in the SHELL card header - after the CardHeader closing tag search
// We replace the specific section in the default card return  
// Looking for: {/* Sparkline chart */} section of the card and replace the whole chart section for SHELL

const lineColors = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6'];
const lineColorMap = "const LINE_COLORS: Record<string, string> = { A: '#3b82f6', B: '#10b981', C: '#f59e0b', D: '#ef4444', D1: '#8b5cf6' };";

// Find the sparkline chart section and replace it with the toggle+mode logic
const oldSparkline = `                    {/* Sparkline chart */}
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
                    </div>`;

const newSparkline = `                    {/* Toggle for SHELL: Overview / Line view */}
                    {deptCode === "SHELL" && (
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs text-muted-foreground">Ch\u1ebf \u0111\u1ed9:</span>
                            <button
                                onClick={() => setShellingViewMode('overview')}
                                className={\`text-xs px-2 py-0.5 rounded-full border transition-colors \${shellingViewMode === 'overview' ? 'bg-primary text-white border-primary' : 'border-gray-300 text-muted-foreground hover:border-primary'}\`}
                            >Overview</button>
                            <button
                                onClick={() => setShellingViewMode('lines')}
                                className={\`text-xs px-2 py-0.5 rounded-full border transition-colors \${shellingViewMode === 'lines' ? 'bg-primary text-white border-primary' : 'border-gray-300 text-muted-foreground hover:border-primary'}\`}
                            >Theo Line</button>
                        </div>
                    )}
                    {/* Sparkline chart */}
                    {deptCode === "SHELL" && shellingViewMode === 'lines' ? (
                        <div className="w-full mt-auto border-t pt-3">
                            <div className="space-y-2">
                                {SHELLING_LINES_DASH.map(line => {
                                    const lineColors: Record<string, string> = { A: '#3b82f6', B: '#10b981', C: '#f59e0b', D: '#ef4444', D1: '#8b5cf6' };
                                    const ld = shellingLineMonthData[line] || { actual_ton: 0, run_hours: 0 };
                                    const efficiency = ld.run_hours > 0 ? (ld.actual_ton / ld.run_hours).toFixed(2) : '\u2014';
                                    const color = lineColors[line] || '#64748b';
                                    return (
                                        <div key={line} className="flex items-center gap-2">
                                            <span className="text-xs font-bold w-6 text-center" style={{ color }}>{line}</span>
                                            <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                                                <div
                                                    className="h-full rounded-full transition-all"
                                                    style={{ width: \`\${Math.min(100, summary.totalActual > 0 ? (ld.actual_ton / summary.totalActual) * 100 : 0)}%\`, backgroundColor: color }}
                                                />
                                            </div>
                                            <span className="text-[10px] font-semibold w-12 text-right" style={{ color }}>{ld.actual_ton.toFixed(1)}T</span>
                                            <span className="text-[10px] text-muted-foreground w-10 text-right">{ld.run_hours.toFixed(0)}h</span>
                                            <span className="text-[10px] font-bold text-green-700 w-14 text-right">{efficiency !== '\u2014' ? efficiency + ' T/h' : '\u2014'}</span>
                                        </div>
                                    );
                                })}
                            </div>
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

if (!content.includes('{/* Sparkline chart */}')) {
    console.error('Sparkline marker not found!');
    process.exit(1);
}

content = content.replace(oldSparkline, newSparkline);
fs.writeFileSync(filePath, content, 'utf8');
console.log('Done! Dashboard updated.');
