const fs = require('fs');
const file = 'src/app/(protected)/dashboard/page.tsx';
let data = fs.readFileSync(file, 'utf8');

// The original code has the indigo/blue virtual-container block.
// I need to replace that whole block with the Intersnack red version.

const oldBlockStart = "if (id === 'virtual-container') {";
const oldBlockEnd = "return (\n            <Card key={id} className={`bg-white/70 backdrop-blur-xl border border-white/50 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 relative overflow-hidden flex flex-col justify-start h-full ring-1 ring-black/5 ${isTotal ? 'ring-primary/40 shadow-primary/10' : ''}`}>\n";

// Use regex to locate the block precisely
const re = new RegExp("if \\(id === 'virtual-container'\\) \\{[\\s\\S]*?return \\(\n\\s*<Card key={id} className={`bg-white/70 backdrop-blur-xl border border-white/50 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 relative overflow-hidden flex flex-col justify-start h-full ring-1 ring-black/5 \\$\\{isTotal \\? 'ring-primary/40 shadow-primary/10' : ''\\}`}>\n");

const match = data.match(re);
if(!match) {
    console.log("Could not find the block to replace.");
    process.exit(1);
}

const newBlock = `if (id === 'virtual-container') {
            return (
                <Card key={id} className={\`bg-gradient-to-br from-red-50/90 to-white/60 backdrop-blur-xl border border-red-200/60 shadow-lg shadow-red-900/5 hover:shadow-2xl hover:-translate-y-1 transition-all duration-500 relative overflow-hidden flex flex-col justify-start h-full ring-1 ring-red-100/50\`}>
                    {/* Glowing ambient background highlights */}
                    <div className="absolute -top-32 -right-32 w-64 h-64 bg-red-400/20 rounded-full blur-3xl pointer-events-none"></div>
                    <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-rose-400/10 rounded-full blur-3xl pointer-events-none"></div>

                    <CardHeader className="p-4 md:p-5 bg-white/60 border-b border-red-100/60 flex-shrink-0 relative z-10 backdrop-blur-md">
                        <div className="flex justify-between items-start mb-3 px-1">
                            <span className="flex items-center gap-3 uppercase font-black tracking-tight text-lg md:text-xl text-red-800 drop-shadow-sm">
                                <div className="p-2 bg-gradient-to-br from-red-100 to-rose-50 rounded-xl shadow-inner border border-white/80">
                                    <FileSymlink className="h-5 w-5 text-[#e63121] drop-shadow-sm" />
                                </div>
                                CONTAINER
                            </span>
                            
                            <div className="flex items-center drop-shadow-sm">
                                <span className={\`font-black flex items-baseline gap-1 \${summary.achivementPct >= 100 ? 'text-emerald-600' : summary.achivementPct >= 80 ? 'text-amber-600' : 'text-rose-600'} text-2xl md:text-3xl\`}>
                                    {summary.achivementPct.toFixed(0)}% <span className="font-bold uppercase text-slate-500 opacity-80 text-xs md:text-sm">MTD</span>
                                </span>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mt-2 bg-white/70 rounded-2xl p-3 border border-red-50 shadow-sm backdrop-blur-sm">
                            <div className="flex flex-col items-center justify-center p-3 rounded-xl bg-gradient-to-br from-red-50/80 to-white/50 border border-red-100/60 shadow-inner group">
                                <span className="text-[10px] md:text-xs uppercase text-[#e63121] font-bold tracking-widest mb-1.5 opacity-80 group-hover:opacity-100 transition-opacity">MTD / Kế Hoạch</span>
                                <div className="flex items-baseline gap-1">
                                    <span className="font-black text-red-700 text-xl md:text-2xl drop-shadow-sm">{actualNum.toFixed(1)}</span>
                                    <span className="text-slate-500 text-sm md:text-base font-semibold">/{planNum.toFixed(1)} <span className="text-[10px] uppercase font-normal ml-0.5">Cont</span></span>
                                </div>
                            </div>

                            <div className="flex flex-col items-center justify-center p-3 rounded-xl bg-gradient-to-br from-emerald-50/80 to-teal-50/50 border border-emerald-100/60 shadow-inner group">
                                <span className="text-[10px] md:text-xs uppercase text-emerald-700 font-bold tracking-widest mb-1.5 opacity-80 group-hover:opacity-100 transition-opacity">Cần Đạt / Ngày</span>
                                <div className={\`font-black text-xl md:text-2xl drop-shadow-sm \${isReached ? 'text-emerald-500' : 'text-emerald-600'}\`}>
                                    {isReached ? 'Đã Đạt 🎉' : \`\${dailyNeeded} Cont\`}
                                </div>
                            </div>
                        </div>
                    </CardHeader>
                    
                    <CardContent className="flex-1 flex flex-col justify-start p-4 pt-5 md:p-6 md:pt-6 relative z-10">
                        <div className="w-full bg-white/70 rounded-2xl h-[200px] md:h-[240px] p-4 border border-red-50 shadow-inner">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={displayHistory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="contActualGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#e63121" stopOpacity={0.9}/>
                                            <stop offset="100%" stopColor="#ef4444" stopOpacity={0.6}/>
                                        </linearGradient>
                                        <linearGradient id="contActualMissGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#fca5a5" stopOpacity={0.8}/>
                                            <stop offset="100%" stopColor="#fecaca" stopOpacity={0.5}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis 
                                        dataKey="name" 
                                        tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} 
                                        tickLine={false} 
                                        axisLine={false}
                                        dy={10}
                                        tickFormatter={(val) => {
                                            const day = parseInt(val, 10);
                                            return (!isNaN(day) && (day === 1 || day === 8 || day === 15 || day === 22 || day === 29)) ? val : '';
                                        }}
                                        minTickGap={0}
                                    />
                                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} dx={-10} />
                                    
                                    <Tooltip 
                                        cursor={{ fill: 'rgba(226, 232, 240, 0.4)' }}
                                        content={({ active, payload, label }: any) => {
                                            if (active && payload && payload.length) {
                                                return (
                                                    <div className="bg-white/95 backdrop-blur-md border border-slate-200/80 rounded-xl shadow-xl p-3.5 text-xs z-50 ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-200">
                                                        <p className="font-bold text-slate-800 mb-2.5 border-b pb-1.5 uppercase tracking-wider">{label}</p>
                                                        <div className="space-y-1.5">
                                                            {payload.map((entry: any, i: number) => (
                                                                <div key={i} className="flex justify-between items-center gap-6">
                                                                    <span className="text-slate-600 font-medium flex items-center gap-2">
                                                                        <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: entry.name === 'Thực tế (Cont)' ? '#e63121' : (entry.color || '#334155') }}></div>
                                                                        {entry.name}
                                                                    </span>
                                                                    <span className="font-black text-slate-800">{Number(entry.value).toFixed(1)} Cont</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )
                                            }
                                            return null;
                                        }}
                                    />
                                    <Legend wrapperStyle={{ paddingTop: '15px', fontSize: '12px', fontWeight: 600, color: '#334155' }} iconType="circle" />
                                    
                                    {!isReached && Number(dailyNeeded) > 0 && remainingDays > 0 && (
                                        <Line type="step" dataKey="DailyNeeded" stroke="#10b981" strokeDasharray="4 4" dot={false} strokeWidth={2.5} name="Target / Ngày" connectNulls={false} />
                                    )}
                                    
                                    <Bar dataKey="Actual" name="Thực tế (Cont)" radius={[6, 6, 0, 0]} maxBarSize={45}>
                                        {displayHistory.map((entry: any, index: number) => {
                                            const isMiss = entry.Plan > 0 && entry.Actual < entry.Plan;
                                            return <Cell key={\`cell-\${index}\`} fill={isMiss ? "url(#contActualMissGradient)" : "url(#contActualGradient)"} />;
                                        })}
                                    </Bar>
                                    
                                    <Line type="step" dataKey="Plan" stroke="#334155" strokeDasharray="3 3" dot={false} strokeWidth={2} name="Kế hoạch (Cont)" />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            );
        }

        return (
            <Card key={id} className={\`bg-white/70 backdrop-blur-xl border border-white/50 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 relative overflow-hidden flex flex-col justify-start h-full ring-1 ring-black/5 \${isTotal ? 'ring-primary/40 shadow-primary/10' : ''}\`}>
`;

data = data.replace(re, newBlock);
fs.writeFileSync(file, data);
console.log('done replacing theme');
