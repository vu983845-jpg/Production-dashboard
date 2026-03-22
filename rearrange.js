const fs = require('fs');

let content = fs.readFileSync('src/app/(protected)/report/page.tsx', 'utf8');

const sIdx = content.indexOf('{/* Shelling Optimized Insights */}');
const eIdx = content.indexOf('{/* Compressor kWh vs Production Chart */}');

const shellingBlock = content.substring(sIdx, eIdx);

// We want to extract cards exactly
function extractCard(nameMarker) {
    const idx = shellingBlock.indexOf(nameMarker);
    if(idx === -1) return '';
    // find nearest <Card> backwards
    let startCard = shellingBlock.lastIndexOf('<Card', idx);
    if(startCard === -1) startCard = shellingBlock.lastIndexOf('{(lineSizePerf', idx); // for Chart 7&8
    // find closing </Card> 
    const endCard = shellingBlock.indexOf('</Card>', idx) + 7;
    let finalEnd = endCard;
    if(nameMarker === '{/* Chart 7 & 8') finalEnd = shellingBlock.indexOf(')}', endCard) + 3; // include the conditional
    
    return shellingBlock.substring(startCard, finalEnd);
}

const cLine = extractCard('{/* Cross-Line Performance */}').replace('className="col-span-1 lg:col-span-2 shadow-sm border-emerald-100"', 'className="col-span-1 lg:col-span-3 shadow-sm border-emerald-100"');
const cSpeed = extractCard('{/* Speed vs Quality Correlation */}');
const cEnergy = extractCard('{/* Energy Intensity */}');
const cEff = extractCard('{/* Chart 1: Performance */}').replace(/<select[\s\S]*?<\/select>\n\s*/, '');
const cMp = extractCard('{/* Chart 3: Manpower */}');
const cBrok = extractCard('{/* Chart 5: % Broken per shift */}');
const cDown = extractCard('{/* Chart 2: Downtime */}').replace('<Card>', '<Card className="col-span-1 lg:col-span-3">'); // Expand downtime
const cLeader = extractCard('{/* Chart 4: Leader Comparison */}');
const cSizePerf = extractCard('{/* Chart 6: Size Performance */}');
const cLineSize = extractCard('{/* Chart 7 & 8: Line-Size Analysis */}');

const newLayout = `                    {/* Shelling Analytics Overview */}
                    {selectedDept === "SHELL" && (
                        <div className="space-y-8 mt-8 mb-4">
                            
                            {/* SECTION 1: OVERALL FACTORY PERFORMANCE */}
                            <div>
                                <h3 className="text-lg font-bold text-slate-800 mb-4 border-b pb-2">1. Hiệu suất Tổng thể (Overall Performance)</h3>
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                    ${cLine}
                                    ${cLeader}
                                    ${cDown}
                                </div>
                            </div>

                            {/* SECTION 2: ADVANCED CORRELATIONS (QUALITY & ENERGY) */}
                            <div>
                                <h3 className="text-lg font-bold text-slate-800 mb-4 border-b pb-2">2. Phân tích Chuyên sâu (Advanced Correlations)</h3>
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                    ${cSpeed}
                                    ${cEnergy}
                                </div>
                                <div className="mt-4 grid grid-cols-1 gap-4">
                                    ${cSizePerf}
                                    ${cLineSize}
                                </div>
                            </div>

                            {/* SECTION 3: LINE DEEP-DIVE */}
                            <div>
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 border-b pb-2">
                                    <h3 className="text-lg font-bold text-slate-800">3. Chi tiết theo Máy (Line Deep-dive)</h3>
                                    <div className="flex items-center gap-2 bg-slate-50 border px-3 py-1.5 rounded-lg shadow-sm">
                                        <span className="text-sm font-semibold text-slate-700">Chọn Line (Select Line):</span>
                                        <select 
                                            value={selectedShellLine} 
                                            onChange={e => setSelectedShellLine(e.target.value)}
                                            className="h-8 text-sm font-bold rounded-md border border-slate-300 bg-white px-2 focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
                                        >
                                            {["A", "B", "C", "D1", "D2"].map(l => <option key={l} value={l}>Line {l}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                    ${cEff}
                                    ${cMp}
                                    ${cBrok}
                                </div>
                            </div>

                        </div>
                    )}
`;

content = content.replace(shellingBlock, newLayout);
fs.writeFileSync('src/app/(protected)/report/page.tsx', content, 'utf8');
console.log('Layout rearranged successfully');
