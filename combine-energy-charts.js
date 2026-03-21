const fs = require('fs');
let c = fs.readFileSync('src/app/(protected)/energy/page.tsx', 'utf8');

// 1. Add state variable
if (!c.includes("mainChartMode")) {
    c = c.replace(
        'const [energyData, setEnergyData] = useState<any[]>([])',
        `const [energyData, setEnergyData] = useState<any[]>([])\n    const [mainChartMode, setMainChartMode] = useState<'kwh' | 'vnd'>('kwh')`
    );
}

// 2. Identify the blocks to replace. 
// From: {/* FACTORY TOTAL ENERGY */} 
// To end of: {/* ELECTRICITY COST CHART */} Card block

const targetRegex = /{\/\* FACTORY TOTAL ENERGY \*\/}.*?{\/\* DEPARTMENT BREAKDOWN STACKED BAR \*\/}/s;

const replacementCode = `{/* COMBINED ENERGY & COST CHART */}
                    <Card className="col-span-2 shadow-sm border-blue-100">
                        <CardHeader className="pb-2 border-b border-slate-100 mb-2">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div>
                                    <CardTitle>Điện Năng Toàn Nhà Máy (Main Energy)</CardTitle>
                                    <CardDescription>Tiêu thụ Điện / Chi phí thực tế (MTD)</CardDescription>
                                </div>
                                <div className="flex items-center bg-slate-100 p-1 rounded-lg">
                                    <button 
                                        onClick={() => setMainChartMode('kwh')}
                                        className={\`px-4 py-1.5 text-xs font-semibold rounded-md transition-all \${mainChartMode === 'kwh' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}\`}>
                                        Sản lượng (kWh)
                                    </button>
                                    <button 
                                        onClick={() => setMainChartMode('vnd')}
                                        className={\`px-4 py-1.5 text-xs font-semibold rounded-md transition-all \${mainChartMode === 'vnd' ? 'bg-white shadow-sm text-amber-600' : 'text-slate-500 hover:text-slate-700'}\`}>
                                        Chi phí (VNĐ)
                                    </button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {(() => {
                                const mtdPeakKwh = energyData.reduce((acc, curr) => acc + (curr.stacked_peak || 0), 0);
                                const mtdNormalKwh = energyData.reduce((acc, curr) => acc + (curr.stacked_normal || 0), 0);
                                const mtdOffpeakKwh = energyData.reduce((acc, curr) => acc + (curr.stacked_offpeak || 0), 0);
                                const fallbackKwh = energyData.reduce((acc, curr) => acc + (curr.fallback_kwh || 0), 0);
                                const mtdTotalKwh = mtdPeakKwh + mtdNormalKwh + mtdOffpeakKwh + fallbackKwh;

                                const mtdPeakVnd = energyData.reduce((acc, curr) => acc + (curr.cost_peak || 0), 0);
                                const mtdNormalVnd = energyData.reduce((acc, curr) => acc + (curr.cost_normal || 0), 0);
                                const mtdOffpeakVnd = energyData.reduce((acc, curr) => acc + (curr.cost_offpeak || 0), 0);
                                const fallbackVnd = energyData.reduce((acc, curr) => acc + (curr.fallback_cost || 0), 0);
                                const mtdTotalVnd = mtdPeakVnd + mtdNormalVnd + mtdOffpeakVnd + fallbackVnd;

                                const isKwh = mainChartMode === 'kwh';

                                return (
                                    <div className="flex flex-col lg:flex-row gap-6">
                                        {/* SUMMARY TABLE (LEFT) */}
                                        <div className="w-full lg:w-1/4 flex flex-col gap-3 shrink-0">
                                            <div className={\`p-4 rounded-xl border \${isKwh ? 'bg-blue-50/50 border-blue-100' : 'bg-amber-50/50 border-amber-100'}\`}>
                                                <p className="text-xs font-bold text-muted-foreground uppercase tracking-tight mb-1">TỔNG MTD THEO {isKwh ? 'KWH' : 'VNĐ'}</p>
                                                <p className={\`text-2xl font-black \${isKwh ? 'text-blue-700' : 'text-amber-600'}\`}>
                                                    {isKwh ? mtdTotalKwh.toLocaleString('vi-VN') : mtdTotalVnd.toLocaleString('vi-VN')}
                                                    <span className="text-sm font-semibold ml-1">{isKwh ? 'kWh' : 'đ'}</span>
                                                </p>
                                            </div>
                                            
                                            <div className="rounded-xl border bg-white overflow-hidden text-sm shadow-sm ring-1 ring-black/5">
                                                <div className="flex justify-between p-2.5 border-b bg-rose-50/30">
                                                    <span className="font-semibold text-rose-600 flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-rose-500"></div>Cao điểm</span>
                                                    <span className="font-mono">{isKwh ? mtdPeakKwh.toLocaleString('vi-VN') : mtdPeakVnd.toLocaleString('vi-VN')}</span>
                                                </div>
                                                <div className="flex justify-between p-2.5 border-b bg-blue-50/30">
                                                    <span className="font-semibold text-blue-600 flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-500"></div>Bình thường</span>
                                                    <span className="font-mono">{isKwh ? mtdNormalKwh.toLocaleString('vi-VN') : mtdNormalVnd.toLocaleString('vi-VN')}</span>
                                                </div>
                                                <div className="flex justify-between p-2.5 bg-emerald-50/30">
                                                    <span className="font-semibold text-emerald-600 flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500"></div>Thấp điểm</span>
                                                    <span className="font-mono">{isKwh ? mtdOffpeakKwh.toLocaleString('vi-VN') : mtdOffpeakVnd.toLocaleString('vi-VN')}</span>
                                                </div>
                                                {((isKwh && fallbackKwh > 0) || (!isKwh && fallbackVnd > 0)) && (
                                                    <div className="flex justify-between p-2.5 border-t bg-gray-50">
                                                        <span className="font-semibold text-gray-500 flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-gray-400"></div>Khác</span>
                                                        <span className="font-mono">{isKwh ? fallbackKwh.toLocaleString('vi-VN') : fallbackVnd.toLocaleString('vi-VN')}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* CHART (RIGHT) */}
                                        <div className="flex-1 h-[300px] lg:h-[350px]">
                                            {energyData.length === 0 ? (
                                                <div className="h-full flex items-center justify-center text-muted-foreground">Chưa có dữ liệu tháng này</div>
                                            ) : (
                                                <ResponsiveContainer width="100%" height="100%">
                                                    {isKwh ? (
                                                        <ComposedChart data={energyData} margin={{ top: 10, right: 10, left: 20, bottom: 0 }}>
                                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                                            <XAxis dataKey="fmtDate" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                                                            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12 }} tickFormatter={(val) => val.toLocaleString('en-US')} />
                                                            <Tooltip content={<CustomTooltip />} />
                                                            <Legend />
                                                            <Bar dataKey="fallback_kwh" stackId="a" name="Tổng (Chưa phân chia)" fill="#9CA3AF" />
                                                            <Bar dataKey="stacked_offpeak" stackId="a" name="Thấp điểm" fill="#10B981" />
                                                            <Bar dataKey="stacked_normal" stackId="a" name="Bình thường" fill="#3B82F6" />
                                                            <Bar dataKey="stacked_peak" stackId="a" name="Cao điểm" fill="#EF4444" radius={[4, 4, 0, 0]} />
                                                            <Line type="monotone" dataKey="electricity_target_kwh" name="Mục tiêu (Target)" stroke="#F59E0B" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                                                        </ComposedChart>
                                                    ) : (
                                                        <BarChart data={energyData} margin={{ top: 10, right: 10, left: 20, bottom: 0 }}>
                                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                                            <XAxis dataKey="fmtDate" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                                                            <YAxis 
                                                                tickLine={false} 
                                                                axisLine={false} 
                                                                tick={{ fontSize: 11 }} 
                                                                tickFormatter={(val) => new Intl.NumberFormat('vi-VN', { notation: "compact" }).format(val)} 
                                                                width={55}
                                                            />
                                                            <Tooltip 
                                                                formatter={(value: any, name: any) => [\`\${Number(value).toLocaleString('vi-VN')} đ\`, name]}
                                                            />
                                                            <Legend />
                                                            <Bar dataKey="fallback_cost" stackId="cost" name="Chi phí ước tính" fill="#9CA3AF" />
                                                            <Bar dataKey="cost_offpeak" stackId="cost" name="Thấp điểm (1,190đ)" fill="#10B981" />
                                                            <Bar dataKey="cost_normal" stackId="cost" name="Bình thường (1,833đ)" fill="#3B82F6" />
                                                            <Bar dataKey="cost_peak" stackId="cost" name="Cao điểm (3,398đ)" fill="#EF4444" radius={[4, 4, 0, 0]} maxBarSize={60} />
                                                        </BarChart>
                                                    )}
                                                </ResponsiveContainer>
                                            )}
                                        </div>
                                    </div>
                                )
                            })()}
                        </CardContent>
                    </Card>

                    {/* MTD PIE CHART - FACTORY ENERGY COMPONENT */}
                    <Card className="col-span-2 lg:col-span-2 shadow-sm">
                        <CardHeader>
                            <CardTitle>Tỷ Trọng Điện MTD (Peak/Normal/Offpeak)</CardTitle>
                            <CardDescription>Cơ cấu lượng điện tiêu thụ trong tháng hiện tại</CardDescription>
                        </CardHeader>
                        <CardContent className="h-[350px]">
                            {(() => {
                                const mtdPeak = energyData.reduce((acc, curr) => acc + (curr.stacked_peak || 0), 0);
                                const mtdNormal = energyData.reduce((acc, curr) => acc + (curr.stacked_normal || 0), 0);
                                const mtdOffpeak = energyData.reduce((acc, curr) => acc + (curr.stacked_offpeak || 0), 0);
                                const total = mtdPeak + mtdNormal + mtdOffpeak;
                                
                                if (energyData.length === 0 || total === 0) {
                                    return <div className="h-full flex items-center justify-center text-muted-foreground">Chưa có dữ liệu phân bổ giờ cao điểm tháng này</div>;
                                }

                                const pieData = [
                                    { name: 'Thấp điểm', value: mtdOffpeak, fill: '#10B981' },
                                    { name: 'Bình thường', value: mtdNormal, fill: '#3B82F6' },
                                    { name: 'Cao điểm', value: mtdPeak, fill: '#EF4444' }
                                ].filter(d => d.value > 0);

                                return (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={pieData}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={60}
                                                outerRadius={110}
                                                paddingAngle={5}
                                                dataKey="value"
                                                label={({ name, percent }) => \`\${name}: \${((percent || 0) * 100).toFixed(1)}%\`}
                                            >
                                                {pieData.map((entry, index) => (
                                                    <Cell key={\`cell-\${index}\`} fill={entry.fill} />
                                                ))}
                                            </Pie>
                                            <Tooltip formatter={(value: any) => \`\${Number(value || 0).toLocaleString('vi-VN')} kWh\`} />
                                            <Legend verticalAlign="bottom" height={36} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                );
                            })()}
                        </CardContent>
                    </Card>

                    {/* DEPARTMENT BREAKDOWN STACKED BAR */}`;

c = c.replace(targetRegex, replacementCode);

fs.writeFileSync('src/app/(protected)/energy/page.tsx', c);
console.log('Successfully combined charts!');
