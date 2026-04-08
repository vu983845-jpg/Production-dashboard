import { readFileSync, writeFileSync } from 'fs';

const path = "src/app/(protected)/input/page.tsx";
let content = readFileSync(path, 'utf8');

// ─── 1. Add CS types & state after peelingFetchRef ───
const PEELING_FETCH_REF = `    const peelingFetchRef = useRef<string>("")`;
const CS_TYPES_STATE = `    const peelingFetchRef = useRef<string>("")

    // ── Color Sorter (CS) 2-shift types & state ──
    type CSShift = 'Ca Tây' | 'Ca Kha'
    type CSShiftEntry = {
        manpower: number
        ot_hours: number
        isp_ton: number
        non_isp_ton: number
        note: string
    }
    const CS_SHIFTS: CSShift[] = ['Ca Tây', 'Ca Kha']
    const CS_SHIFT_LEADERS: Record<CSShift, string> = { 'Ca Tây': 'Mr. Tây', 'Ca Kha': 'Mr. Kha' }
    const CS_SHIFT_BASE_HOURS = 7.5
    const initCSShift = (): CSShiftEntry => ({ manpower: 0, ot_hours: 0, isp_ton: 0, non_isp_ton: 0, note: '' })
    const [csShiftData, setCsShiftData] = useState<Record<CSShift, CSShiftEntry>>({
        'Ca Tây': initCSShift(), 'Ca Kha': initCSShift()
    })
    const csFetchRef = useRef<string>("")`;

if (content.includes(PEELING_FETCH_REF) && !content.includes('csFetchRef')) {
    content = content.replace(PEELING_FETCH_REF, CS_TYPES_STATE);
    console.log('✅ Step 1: CS types/state added');
} else {
    console.log('⚠️  Step 1: already done or target not found');
}

// ─── 2. Add CS fetch trigger in useEffect ───
const PEEL_TRIGGER_END = `            if (peelingFetchRef.current !== cacheKey) {
                peelingFetchRef.current = cacheKey;
                fetchPeelingShiftData();
            }
        }
    }, [selectedDept, date, formActual, formKpi, departments])`;
const CS_TRIGGER = `            if (peelingFetchRef.current !== cacheKey) {
                peelingFetchRef.current = cacheKey;
                fetchPeelingShiftData();
            }
        }
        if (deptCodeLine === 'CS') {
            const csCacheKey = \`\${selectedDept}-\${format(date, "yyyy-MM-dd")}\`;
            if (csFetchRef.current !== csCacheKey) {
                csFetchRef.current = csCacheKey;
                fetchCSShiftData();
            }
        }
    }, [selectedDept, date, formActual, formKpi, departments])`;

if (content.includes(PEEL_TRIGGER_END) && !content.includes("deptCodeLine === 'CS'")) {
    content = content.replace(PEEL_TRIGGER_END, CS_TRIGGER);
    console.log('✅ Step 2: CS fetch trigger added');
} else {
    console.log('⚠️  Step 2: already done or target not found');
}

// ─── 3. Add fetchCSShiftData & saveCSShifts before saveShellingLines ───
const SAVE_SHELLING_START = `    async function saveShellingLines() {`;
const CS_FUNCTIONS = `    async function fetchCSShiftData() {
        if (!selectedDept) return;
        const formattedDate = format(date, "yyyy-MM-dd")
        const currentRef = csFetchRef.current;
        const { data } = await supabase
            .from('cs_shift_daily')
            .select('*')
            .eq('department_id', selectedDept)
            .eq('work_date', formattedDate)
        if (csFetchRef.current !== currentRef) return;
        const newData: Record<CSShift, CSShiftEntry> = {
            'Ca Tây': initCSShift(), 'Ca Kha': initCSShift()
        }
        if (data && data.length > 0) {
            data.forEach((r: any) => {
                const shift = (r.shift_name || 'Ca Tây') as CSShift
                newData[shift] = {
                    manpower: Number(r.manpower || 0),
                    ot_hours: Number(r.ot_hours || 0),
                    isp_ton: Number(r.isp_ton || 0),
                    non_isp_ton: Number(r.non_isp_ton || 0),
                    note: r.note || '',
                }
            })
        }
        setCsShiftData(newData)
        const totalIsp = CS_SHIFTS.reduce((s, sh) => s + newData[sh].isp_ton, 0)
        const totalNonIsp = CS_SHIFTS.reduce((s, sh) => s + newData[sh].non_isp_ton, 0)
        if (totalIsp + totalNonIsp > 0) {
            formActual.setValue('isp_ton', totalIsp)
            formActual.setValue('actual_ton', totalIsp + totalNonIsp)
        }
    }

    async function saveCSShifts() {
        if (!selectedDept) return;
        setIsSaving(true)
        const formattedDate = format(date, "yyyy-MM-dd")
        const totalDowntimeMins = downtimes.reduce((s, r) => s + Number(r.duration_mins || 0), 0)
        const downtimePerShift = totalDowntimeMins / 2
        const payload = CS_SHIFTS.map(shift => {
            const d = csShiftData[shift]
            const actual_ton = (d.isp_ton || 0) + (d.non_isp_ton || 0)
            return {
                department_id: selectedDept,
                work_date: formattedDate,
                shift_name: shift,
                shift_leader: CS_SHIFT_LEADERS[shift],
                manpower: d.manpower,
                ot_hours: d.ot_hours,
                isp_ton: d.isp_ton,
                non_isp_ton: d.non_isp_ton,
                actual_ton,
                downtime_min: downtimePerShift,
                note: d.note || null,
                updated_by: userId,
                updated_at: new Date().toISOString()
            }
        })
        const { error } = await supabase
            .from('cs_shift_daily')
            .upsert(payload, { onConflict: 'department_id,work_date,shift_name' })
        if (error) {
            toast.error('Lỗi khi lưu ca Color Sorter: ' + error.message)
            setIsSaving(false)
            return
        }
        const totalIsp = CS_SHIFTS.reduce((s, sh) => s + (csShiftData[sh].isp_ton || 0), 0)
        const totalNonIsp = CS_SHIFTS.reduce((s, sh) => s + (csShiftData[sh].non_isp_ton || 0), 0)
        await supabase.from('daily_actual').upsert({
            department_id: selectedDept,
            work_date: formattedDate,
            isp_ton: totalIsp,
            actual_ton: totalIsp + totalNonIsp,
            updated_by: userId,
            updated_at: new Date().toISOString()
        }, { onConflict: 'department_id,work_date' })
        formActual.setValue('isp_ton', totalIsp)
        formActual.setValue('actual_ton', totalIsp + totalNonIsp)
        toast.success('Đã lưu dữ liệu 2 ca Color Sorter thành công!')
        setIsSaving(false)
    }

    async function saveShellingLines() {`;

if (content.includes(SAVE_SHELLING_START) && !content.includes('saveCSShifts')) {
    content = content.replace(SAVE_SHELLING_START, CS_FUNCTIONS);
    console.log('✅ Step 3: CS functions added');
} else {
    console.log('⚠️  Step 3: already done or target not found');
}

// ─── 4. Add CS 2-shift Card UI before the closing TabsContent after Peeling card ───
// Find the closing of PEEL_MC card block
const PEELING_CARD_END = `                                    )}

                                \t</TabsContent>`;
const CS_CARD_JSX = `                                    )}

                                    {/* ── Color Sorter 2-shift breakdown card ── */}
                                    {departments.find(d => d.id === selectedDept)?.code === 'CS' && (
                                        <div className="rounded-xl border bg-card text-card-foreground shadow">
                                            <div className="p-6 space-y-4">
                                                <div className="flex justify-between items-center">
                                                    <div>
                                                        <h3 className="font-semibold text-lg text-violet-800">🎨 Chi tiết sản lượng 2 ca — Color Sorter</h3>
                                                        <p className="text-sm text-muted-foreground">Nhập dữ liệu từng ca (Mr. Tây / Mr. Kha), sau đó bấm <strong>Lưu 2 Ca</strong></p>
                                                    </div>
                                                    <Button onClick={saveCSShifts} disabled={isSaving} className="bg-violet-600 hover:bg-violet-700 text-white">
                                                        <Save className="mr-2 h-4 w-4" />
                                                        {isSaving ? 'Đang lưu...' : 'Lưu 2 Ca'}
                                                    </Button>
                                                </div>

                                                {/* Downtime notice */}
                                                {(() => {
                                                    const totalDt = downtimes.reduce((s, r) => s + Number(r.duration_mins || 0), 0)
                                                    return totalDt > 0 ? (
                                                        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                                                            <span className="font-bold">⚠️ Tổng downtime hôm nay: {totalDt} phút</span>
                                                            <span className="text-red-500">→ Mỗi ca tự động trừ {(totalDt / 2).toFixed(0)} phút khi tính FTE</span>
                                                        </div>
                                                    ) : null
                                                })()}

                                                {/* 2-shift cards */}
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    {CS_SHIFTS.map(shift => {
                                                        const d = csShiftData[shift]
                                                        const totalDtMins = downtimes.reduce((s, r) => s + Number(r.duration_mins || 0), 0)
                                                        const dtPerShift = totalDtMins / 2
                                                        const netHours = Math.max(0, CS_SHIFT_BASE_HOURS + (d.ot_hours || 0) - dtPerShift / 60)
                                                        const totalTon = (d.isp_ton || 0) + (d.non_isp_ton || 0)
                                                        const fteHours = (d.manpower || 0) * netHours
                                                        const tonsPerFteH = fteHours > 0 ? (totalTon / fteHours).toFixed(4) : '—'
                                                        const isWest = shift === 'Ca Tây'
                                                        return (
                                                            <div key={shift} className={\`rounded-lg border-2 \${isWest ? 'border-blue-200 bg-blue-50/30' : 'border-emerald-200 bg-emerald-50/30'} p-4 space-y-3\`}>
                                                                <div className={\`flex items-center gap-2 font-bold text-base \${isWest ? 'text-blue-800' : 'text-emerald-800'}\`}>
                                                                    <span className="text-lg">{isWest ? '🌅' : '🌆'}</span>
                                                                    <span>{shift} — {CS_SHIFT_LEADERS[shift]}</span>
                                                                </div>
                                                                <div className="grid grid-cols-2 gap-2">
                                                                    <div className="space-y-1">
                                                                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Số người (MP)</Label>
                                                                        <input type="number" min="0" step="1"
                                                                            value={d.manpower || ''}
                                                                            onChange={e => setCsShiftData(prev => ({ ...prev, [shift]: { ...prev[shift], manpower: Number(e.target.value) || 0 } }))}
                                                                            className={\`w-full text-right p-2 rounded border font-semibold text-sm outline-none focus:ring-2 bg-white \${isWest ? 'focus:ring-blue-400 border-blue-200' : 'focus:ring-emerald-400 border-emerald-200'}\`}
                                                                        />
                                                                    </div>
                                                                    <div className="space-y-1">
                                                                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Tăng ca (giờ OT)</Label>
                                                                        <input type="number" min="0" step="0.5"
                                                                            value={d.ot_hours || ''}
                                                                            onChange={e => setCsShiftData(prev => ({ ...prev, [shift]: { ...prev[shift], ot_hours: Number(e.target.value) || 0 } }))}
                                                                            className={\`w-full text-right p-2 rounded border font-semibold text-sm outline-none focus:ring-2 bg-white \${isWest ? 'focus:ring-blue-400 border-blue-200' : 'focus:ring-emerald-400 border-emerald-200'}\`}
                                                                        />
                                                                    </div>
                                                                    <div className="space-y-1">
                                                                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Sản lượng ISP (Tấn)</Label>
                                                                        <input type="number" min="0" step="0.001"
                                                                            value={d.isp_ton || ''}
                                                                            onChange={e => setCsShiftData(prev => ({ ...prev, [shift]: { ...prev[shift], isp_ton: Number(e.target.value) || 0 } }))}
                                                                            className={\`w-full text-right p-2 rounded border font-semibold text-sm outline-none focus:ring-2 bg-white \${isWest ? 'focus:ring-blue-400 border-blue-200' : 'focus:ring-emerald-400 border-emerald-200'}\`}
                                                                        />
                                                                    </div>
                                                                    <div className="space-y-1">
                                                                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Sản lượng Non-ISP (Tấn)</Label>
                                                                        <input type="number" min="0" step="0.001"
                                                                            value={d.non_isp_ton || ''}
                                                                            onChange={e => setCsShiftData(prev => ({ ...prev, [shift]: { ...prev[shift], non_isp_ton: Number(e.target.value) || 0 } }))}
                                                                            className={\`w-full text-right p-2 rounded border font-semibold text-sm outline-none focus:ring-2 bg-white \${isWest ? 'focus:ring-blue-400 border-blue-200' : 'focus:ring-emerald-400 border-emerald-200'}\`}
                                                                        />
                                                                    </div>
                                                                </div>
                                                                <div className="space-y-1">
                                                                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">Ghi chú</Label>
                                                                    <input type="text"
                                                                        value={d.note || ''}
                                                                        onChange={e => setCsShiftData(prev => ({ ...prev, [shift]: { ...prev[shift], note: e.target.value } }))}
                                                                        placeholder="Tuỳ chọn..."
                                                                        className="w-full p-2 rounded border border-gray-200 outline-none focus:ring-1 bg-white text-sm"
                                                                    />
                                                                </div>
                                                                {/* KPI summary box */}
                                                                <div className={\`rounded-md p-3 \${isWest ? 'bg-blue-100/60' : 'bg-emerald-100/60'} grid grid-cols-2 gap-2 text-xs\`}>
                                                                    <div>
                                                                        <p className="text-muted-foreground">Tổng sản lượng ca</p>
                                                                        <p className={\`font-black text-base \${isWest ? 'text-blue-700' : 'text-emerald-700'}\`}>{totalTon.toFixed(3)} T</p>
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-muted-foreground">Giờ hiệu quả (net)</p>
                                                                        <p className="font-semibold text-gray-700">{netHours.toFixed(2)} h</p>
                                                                        <p className="text-[10px] text-muted-foreground">(7.5h + {d.ot_hours || 0}h OT − {(dtPerShift/60).toFixed(2)}h DT)</p>
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-muted-foreground">FTE·giờ</p>
                                                                        <p className="font-semibold text-gray-700">{fteHours.toFixed(1)}</p>
                                                                        <p className="text-[10px] text-muted-foreground">({d.manpower || 0} người × {netHours.toFixed(2)}h)</p>
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-muted-foreground">Tấn / FTE·giờ</p>
                                                                        <p className={\`font-black text-base \${isWest ? 'text-blue-700' : 'text-emerald-700'}\`}>{tonsPerFteH}</p>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )
                                                    })}
                                                </div>

                                                {/* Grand totals */}
                                                {(() => {
                                                    const totalDtMins = downtimes.reduce((s, r) => s + Number(r.duration_mins || 0), 0)
                                                    const grandIsp = CS_SHIFTS.reduce((s, sh) => s + (csShiftData[sh].isp_ton || 0), 0)
                                                    const grandNonIsp = CS_SHIFTS.reduce((s, sh) => s + (csShiftData[sh].non_isp_ton || 0), 0)
                                                    const grandTon = grandIsp + grandNonIsp
                                                    const grandMp = CS_SHIFTS.reduce((s, sh) => s + (csShiftData[sh].manpower || 0), 0)
                                                    const grandOt = CS_SHIFTS.reduce((s, sh) => s + (csShiftData[sh].ot_hours || 0), 0)
                                                    const grandFte = CS_SHIFTS.reduce((s, sh) => {
                                                        const d = csShiftData[sh]
                                                        const net = Math.max(0, CS_SHIFT_BASE_HOURS + (d.ot_hours || 0) - (totalDtMins / 2) / 60)
                                                        return s + (d.manpower || 0) * net
                                                    }, 0)
                                                    return (
                                                        <div className="rounded-lg bg-violet-50 border border-violet-200 p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
                                                            <div className="text-center">
                                                                <p className="text-xs text-violet-600 font-medium">Tổng ISP cả ngày</p>
                                                                <p className="text-xl font-black text-violet-800">{grandIsp.toFixed(3)} T</p>
                                                            </div>
                                                            <div className="text-center">
                                                                <p className="text-xs text-violet-600 font-medium">Tổng Non-ISP cả ngày</p>
                                                                <p className="text-xl font-black text-violet-800">{grandNonIsp.toFixed(3)} T</p>
                                                            </div>
                                                            <div className="text-center">
                                                                <p className="text-xs text-violet-600 font-medium">Tổng sản lượng</p>
                                                                <p className="text-2xl font-black text-violet-900">{grandTon.toFixed(3)} T</p>
                                                            </div>
                                                            <div className="text-center">
                                                                <p className="text-xs text-violet-600 font-medium">Hiệu suất (T/FTE·h)</p>
                                                                <p className="text-2xl font-black text-violet-900">{grandFte > 0 ? (grandTon / grandFte).toFixed(4) : '—'}</p>
                                                                <p className="text-[10px] text-violet-500">{grandMp} người · {grandOt}h OT · {totalDtMins}p DT</p>
                                                            </div>
                                                        </div>
                                                    )
                                                })()}
                                            </div>
                                        </div>
                                    )}

                                \t</TabsContent>`;

if (content.includes(PEELING_CARD_END) && !content.includes("Color Sorter 2-shift breakdown card")) {
    content = content.replace(PEELING_CARD_END, CS_CARD_JSX);
    console.log('✅ Step 4: CS UI card added');
} else {
    console.log('⚠️  Step 4: already done or target not found');
    // Debug: let's see what's around the target
    const idx = content.indexOf('TabsContent>');
    console.log('TabsContent found at:', idx);
}

writeFileSync(path, content, 'utf8');
console.log('\n✅ All done! File written successfully.');
