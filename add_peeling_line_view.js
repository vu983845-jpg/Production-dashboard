const fs = require('fs');
const path = 'C:/Users/Cashew/.gemini/PPE/factory-dashboard/src/app/(protected)/dashboard/page.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Define peelingLineMonthData alongside shellingLineMonthData
if (!content.includes('peelingLineMonthData')) {
    content = content.replace(
        "const [shellingLineMonthData, setShellingLineMonthData] = useState<Record<string, { actual_ton: number; run_hours: number }>>({})",
        "const [shellingLineMonthData, setShellingLineMonthData] = useState<Record<string, { actual_ton: number; run_hours: number }>>({})\n    const [peelingLineMonthData, setPeelingLineMonthData] = useState<Record<string, { actual_ton: number }>>({})"
    );
}

// 2. Populate peelingLineMonthData in fetchDashboard block
// We need to inject code after: const avgUnpeelPct = totalUnpeelTon > 0 ? totalUnpeelWeight / totalUnpeelTon : 0;
const peelPopulateAnchor = "const avgUnpeelPct = totalUnpeelTon > 0 ? totalUnpeelWeight / totalUnpeelTon : 0;";
const peelPopulateBlock = `
                const peelMonthData: Record<string, { actual_ton: number }> = {};
                peelLineData.forEach((r: any) => {
                    const lc = r.line_code;
                    const ton = Number(r.actual_ton || 0);
                    if (!peelMonthData[lc]) peelMonthData[lc] = { actual_ton: 0 };
                    peelMonthData[lc].actual_ton += ton;
                });
                setPeelingLineMonthData(peelMonthData);
`;

if (content.includes(peelPopulateAnchor) && !content.includes('setPeelingLineMonthData(peelMonthData)')) {
    content = content.replace(peelPopulateAnchor, peelPopulateAnchor + peelPopulateBlock);
}

// 3. Add to the By Line view block
// Looking for: } : ['SHELL', 'PEEL_MC'].includes(deptCode) && deptViewModes[id] === 'lines' ? (
// and we need to differentiate rendering for PEEL_MC vs SHELL.
// Shell uses shellingSubView and shellingLineMonthData. Peel just has production data.

// Instead of rewriting heavily with regex, we can just replace the whole section starting from
// `} : ['SHELL', 'PEEL_MC'].includes(deptCode) && deptViewModes[id] === 'lines' ? (`
// Actually, let's find the exact block and replace it.

const lineViewRegex = /\} : \['SHELL', 'PEEL_MC'\].includes\(deptCode\) && deptViewModes\[id\] === 'lines' \? \([\s\S]*?\) : deptCode ===/g;
const match = lineViewRegex.exec(content);

if (match) {
    const rawBlock = match[0];
    // Check if we already injected PEEL_MC rendering logic
    if (!rawBlock.includes('peelingLineMonthData')) {
        let newBlock = rawBlock.replace(
            `    {shellingSubView === 'production' ? (`,
            `    {deptCode === 'PEEL_MC' ? (
                                SHELLING_LINES_DASH.map(line => {
                                    const lc: Record<string, string> = { A: '#3b82f6', B: '#10b981', C: '#f59e0b', D1: '#ef4444', D2: '#8b5cf6' }
                                    const ld = peelingLineMonthData[line] || { actual_ton: 0 }
                                    const pct = summary.totalActual > 0 ? Math.min(100, (ld.actual_ton / summary.totalActual) * 100) : 0
                                    const color = lc[line] || '#64748b'
                                    return (
                                        <div key={line} className="flex items-center gap-2 mb-2">
                                            <span className="text-[10px] font-black w-5 text-center shrink-0" style={{ color }}>{line}</span>
                                            <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                                                <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: \`\${pct}%\`, backgroundColor: color }} />
                                            </div>
                                            <span className="text-[10px] font-bold w-12 text-right shrink-0" style={{ color }}>{ld.actual_ton.toFixed(1)} T</span>
                                        </div>
                                    )
                                })
                            ) : shellingSubView === 'production' ? (`
        );
        content = content.replace(rawBlock, newBlock);
        console.log('Updated lines view for PEEL_MC');
    }
}

fs.writeFileSync(path, content);
console.log('Dashboard PEEL_MC modifications complete');
