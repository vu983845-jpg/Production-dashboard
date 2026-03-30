import sys

content = open('src/app/(protected)/bao-com/page.tsx', 'rb').read()

# Find cut point: line starting TrainAITab sub-component comment
cut_marker = b'// \xe2\x94\x80\xe2\x94\x80\xe2\x94\x80 Sub-component: TrainAITab'
cut_idx = content.find(cut_marker)
# Find preceding newline
while cut_idx > 0 and content[cut_idx-1:cut_idx] != b'\n':
    cut_idx -= 1

keep = content[:cut_idx]
print('Cutting at byte:', cut_idx, '— kept bytes:', len(keep))

new_part = """\
// ─── Sub-component: TrainAITab ────────────────────────────────────────────────
type AIExample = {
    id: string
    title: string
    input_text: string
    expected_json: unknown
    dept_hint: string | null
    is_active: boolean
    created_at: string
}

// Editable row for the "easy" form (no JSON required)
type EditRow = {
    senderHint: string
    date: string       // DD/MM/YYYY
    area: string       // khu vực (freetext or code)
    shift: string      // "1" | "2" | "3"
    officialPresent: string
    officialAbsent: string
    seasonalPresent: string
    seasonalAbsent: string
    ot: string
    vegetarian: string
}

function rowToJson(row: EditRow) {
    // Convert DD/MM/YYYY → YYYY-MM-DD for JSON
    const parts = row.date.split('/')
    const isoDate = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : row.date
    return {
        senderHint: row.senderHint,
        date: isoDate,
        area: row.area,
        shift: row.shift,
        officialPresent: row.officialPresent === '' ? null : Number(row.officialPresent),
        officialAbsent: row.officialAbsent === '' ? null : Number(row.officialAbsent),
        seasonalPresent: row.seasonalPresent === '' ? null : Number(row.seasonalPresent),
        seasonalAbsent: row.seasonalAbsent === '' ? null : Number(row.seasonalAbsent),
        ot: row.ot,
        vegetarian: row.vegetarian === '' ? null : Number(row.vegetarian),
    }
}

function recordToEditRow(r: ReturnType<typeof parseZaloText>[0]): EditRow {
    return {
        senderHint: r.senderHint,
        date: r.date,
        area: r.area,
        shift: r.shift,
        officialPresent: r.officialPresent != null ? String(r.officialPresent) : '',
        officialAbsent: r.officialAbsent != null ? String(r.officialAbsent) : '',
        seasonalPresent: r.seasonalPresent != null ? String(r.seasonalPresent) : '',
        seasonalAbsent: r.seasonalAbsent != null ? String(r.seasonalAbsent) : '',
        ot: r.ot ?? '0',
        vegetarian: r.vegetarian != null ? String(r.vegetarian) : '',
    }
}

function TrainAITab({ supabase }: { supabase: ReturnType<typeof import('@/lib/supabase/client').createClient> }) {
    const [examples, setExamples] = useState<AIExample[]>([])
    const [loading, setLoading] = useState(true)
    const [showForm, setShowForm] = useState(false)
    const [saving, setSaving] = useState(false)
    const [expandedId, setExpandedId] = useState<string | null>(null)

    // Easy-mode form state
    const [formTitle, setFormTitle] = useState('')
    const [formDept, setFormDept] = useState('')
    const [formInput, setFormInput] = useState('')
    const [editRows, setEditRows] = useState<EditRow[]>([])
    const [parsed, setParsed] = useState(false)
    const [formErr, setFormErr] = useState<string | null>(null)

    const loadExamples = useCallback(async () => {
        setLoading(true)
        const { data } = await supabase
            .from('meal_ai_examples')
            .select('*')
            .order('created_at', { ascending: false })
        setExamples((data ?? []) as AIExample[])
        setLoading(false)
    }, [supabase])

    useEffect(() => { loadExamples() }, [loadExamples])

    const handleToggleActive = async (ex: AIExample) => {
        await supabase.from('meal_ai_examples').update({ is_active: !ex.is_active }).eq('id', ex.id)
        setExamples(prev => prev.map(e => e.id === ex.id ? { ...e, is_active: !ex.is_active } : e))
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Xóa ví dụ này?')) return
        await supabase.from('meal_ai_examples').delete().eq('id', id)
        setExamples(prev => prev.filter(e => e.id !== id))
    }

    // Step 1: parse pasted text → populate table
    const handlePreview = () => {
        setFormErr(null)
        if (!formInput.trim()) { setFormErr('Vui lòng paste đoạn Zalo vào trước'); return }
        const records = parseZaloText(formInput)
        if (records.length === 0) { setFormErr('Không tìm thấy dữ liệu hợp lệ trong đoạn text'); return }
        setEditRows(records.map(recordToEditRow))
        setParsed(true)
    }

    // Update a single cell in the edit table
    const updateRow = (i: number, field: keyof EditRow, val: string) => {
        setEditRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r))
    }

    // Add a blank row
    const addRow = () => {
        setEditRows(prev => [...prev, {
            senderHint: '', date: '', area: '', shift: '1',
            officialPresent: '0', officialAbsent: '0',
            seasonalPresent: '0', seasonalAbsent: '0',
            ot: '0', vegetarian: '',
        }])
    }

    const removeRow = (i: number) => {
        setEditRows(prev => prev.filter((_, idx) => idx !== i))
    }

    // Step 2: save — build JSON automatically from table
    const handleSubmit = async () => {
        setFormErr(null)
        if (!formTitle.trim()) { setFormErr('Cần nhập tiêu đề ví dụ'); return }
        if (!formInput.trim()) { setFormErr('Cần có text Zalo gốc'); return }
        if (editRows.length === 0) { setFormErr('Cần có ít nhất 1 dòng dữ liệu'); return }
        const jsonArr = editRows.map(rowToJson)

        setSaving(true)
        const { error } = await supabase.from('meal_ai_examples').insert({
            title: formTitle.trim(),
            input_text: formInput.trim(),
            expected_json: jsonArr,
            dept_hint: formDept.trim() || null,
            is_active: true,
        })
        setSaving(false)
        if (error) { setFormErr('Lỗi lưu: ' + error.message); return }
        // Reset form
        setFormTitle(''); setFormDept(''); setFormInput('')
        setEditRows([]); setParsed(false); setShowForm(false)
        await loadExamples()
    }

    const handleCancel = () => {
        setShowForm(false); setFormErr(null)
        setFormTitle(''); setFormDept(''); setFormInput('')
        setEditRows([]); setParsed(false)
    }

    const activeCount = examples.filter(e => e.is_active).length

    // Numeric input cell helper
    const numCell = (i: number, field: keyof EditRow, val: string) => (
        <input
            type="number"
            min={0}
            value={val}
            onChange={e => updateRow(i, field, e.target.value)}
            className="w-14 border rounded px-1.5 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-violet-400"
        />
    )

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h2 className="text-lg font-bold flex items-center gap-2">
                        <span>🤖</span> Dạy AI — Few-shot Examples
                    </h2>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Thêm ví dụ thực tế để AI học cách parse đúng hơn cho nhà máy của bạn.
                        {' '}<span className="font-semibold text-violet-700">{activeCount} ví dụ đang được dùng</span> trong mỗi lần AI phân tích.
                    </p>
                </div>
                <button
                    onClick={() => showForm ? handleCancel() : setShowForm(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition-colors"
                >
                    <span>{showForm ? '✕ Đóng' : '+ Thêm ví dụ mới'}</span>
                </button>
            </div>

            {/* Hướng dẫn đơn giản mới */}
            <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 text-sm text-violet-800 space-y-1">
                <p className="font-semibold">📌 Cách dạy AI (không cần biết code):</p>
                <ol className="list-decimal list-inside space-y-1 text-violet-700">
                    <li>Paste đoạn Zalo bị sai vào ô text → Bấm <strong>Phân tích thử</strong></li>
                    <li>Sửa trực tiếp các con số trong bảng nếu AI đọc sai</li>
                    <li>Bấm <strong>Lưu ví dụ</strong> — xong! Không cần viết JSON</li>
                </ol>
                <p className="text-xs text-violet-500 mt-2">💡 Tối đa 10 ví dụ active. Nên chọn các trường hợp đặc thù của nhà máy.</p>
            </div>

            {/* ─── Easy Add Form ─── */}
            {showForm && (
                <div className="bg-card border border-violet-200 rounded-xl p-5 space-y-4 shadow-sm">
                    <h3 className="font-semibold text-sm text-violet-800">✏️ Thêm ví dụ huấn luyện mới</h3>

                    {/* Title + Dept row */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">Tiêu đề ví dụ *</label>
                            <input
                                value={formTitle}
                                onChange={e => setFormTitle(e.target.value)}
                                placeholder="VD: Cháu MC Peeling Ca 2"
                                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">Bộ phận liên quan (gợi ý)</label>
                            <input
                                value={formDept}
                                onChange={e => setFormDept(e.target.value)}
                                placeholder="VD: PEEL, STEAM, HPEEL..."
                                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                            />
                        </div>
                    </div>

                    {/* Zalo text paste */}
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-muted-foreground">📋 Paste đoạn Zalo bị AI đọc sai *</label>
                        <textarea
                            value={formInput}
                            onChange={e => { setFormInput(e.target.value); setParsed(false); setEditRows([]) }}
                            rows={5}
                            placeholder={`VD:\nCháu MC Peeling\nDate: 26/03/2026\nKhu vực : Peeling mc\nCa: 2\nChính thức hiện diện: 8\nChính thức vắng: 1\nOT:`}
                            className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-400 resize-y"
                        />
                        <button
                            onClick={handlePreview}
                            className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors"
                        >
                            🔍 Phân tích thử
                        </button>
                    </div>

                    {/* Editable result table */}
                    {parsed && editRows.length > 0 && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <p className="text-xs font-semibold text-green-700">
                                    ✅ Đã đọc được {editRows.length} dòng — kiểm tra và sửa nếu sai:
                                </p>
                                <button
                                    onClick={addRow}
                                    className="text-xs px-2 py-1 rounded border border-dashed border-violet-400 text-violet-600 hover:bg-violet-50"
                                >
                                    + Thêm dòng
                                </button>
                            </div>
                            <div className="overflow-x-auto rounded-lg border">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="bg-violet-50 text-left text-violet-700 font-semibold">
                                            <th className="px-2 py-2">Ngày</th>
                                            <th className="px-2 py-2">Khu vực</th>
                                            <th className="px-2 py-2">Ca</th>
                                            <th className="px-2 py-2 text-center">CT HĐ</th>
                                            <th className="px-2 py-2 text-center">CT Vắng</th>
                                            <th className="px-2 py-2 text-center">TV HĐ</th>
                                            <th className="px-2 py-2 text-center">TV Vắng</th>
                                            <th className="px-2 py-2 text-center">OT</th>
                                            <th className="px-2 py-2 text-center">Chay</th>
                                            <th className="px-2 py-2"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {editRows.map((row, i) => (
                                            <tr key={i} className="hover:bg-violet-50/40">
                                                <td className="px-2 py-1.5">
                                                    <input
                                                        value={row.date}
                                                        onChange={e => updateRow(i, 'date', e.target.value)}
                                                        placeholder="DD/MM/YYYY"
                                                        className="w-24 border rounded px-1.5 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-violet-400"
                                                    />
                                                </td>
                                                <td className="px-2 py-1.5">
                                                    <input
                                                        value={row.area}
                                                        onChange={e => updateRow(i, 'area', e.target.value)}
                                                        placeholder="VD: Peeling mc"
                                                        className="w-28 border rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-violet-400"
                                                    />
                                                </td>
                                                <td className="px-2 py-1.5">
                                                    <select
                                                        value={row.shift}
                                                        onChange={e => updateRow(i, 'shift', e.target.value)}
                                                        className="border rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-violet-400"
                                                    >
                                                        <option value="1">Ca 1</option>
                                                        <option value="2">Ca 2</option>
                                                        <option value="3">Ca 3</option>
                                                    </select>
                                                </td>
                                                <td className="px-2 py-1.5 text-center">{numCell(i, 'officialPresent', row.officialPresent)}</td>
                                                <td className="px-2 py-1.5 text-center">{numCell(i, 'officialAbsent', row.officialAbsent)}</td>
                                                <td className="px-2 py-1.5 text-center">{numCell(i, 'seasonalPresent', row.seasonalPresent)}</td>
                                                <td className="px-2 py-1.5 text-center">{numCell(i, 'seasonalAbsent', row.seasonalAbsent)}</td>
                                                <td className="px-2 py-1.5 text-center">
                                                    <input
                                                        value={row.ot}
                                                        onChange={e => updateRow(i, 'ot', e.target.value)}
                                                        className="w-12 border rounded px-1.5 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-violet-400"
                                                    />
                                                </td>
                                                <td className="px-2 py-1.5 text-center">{numCell(i, 'vegetarian', row.vegetarian)}</td>
                                                <td className="px-2 py-1.5">
                                                    <button
                                                        onClick={() => removeRow(i)}
                                                        className="text-red-400 hover:text-red-600 text-xs px-1"
                                                        title="Xóa dòng"
                                                    >✕</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <p className="text-xs text-muted-foreground">CT = Chính thức · TV = Thời vụ · HĐ = Hiện diện</p>
                        </div>
                    )}

                    {formErr && (
                        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formErr}</div>
                    )}

                    <div className="flex gap-2">
                        <button
                            onClick={handleSubmit}
                            disabled={saving || !parsed || editRows.length === 0}
                            className="px-5 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold disabled:opacity-40 transition-colors"
                        >
                            {saving ? 'Đang lưu...' : '💾 Lưu ví dụ'}
                        </button>
                        <button
                            onClick={handleCancel}
                            className="px-4 py-2 rounded-lg border text-sm"
                        >Hủy</button>
                    </div>
                </div>
            )}

            {/* ─── Examples table ─── */}
            {loading ? (
                <div className="text-center py-10 text-muted-foreground">Đang tải...</div>
            ) : examples.length === 0 ? (
                <div className="bg-muted/30 rounded-xl border p-10 text-center text-muted-foreground">
                    <p className="text-3xl mb-3">📭</p>
                    <p className="font-medium">Chưa có ví dụ nào</p>
                    <p className="text-sm mt-1">Bấm &quot;+ Thêm ví dụ mới&quot; để bắt đầu dạy AI</p>
                </div>
            ) : (
                <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-muted/60 text-left text-xs text-muted-foreground uppercase tracking-wide border-b">
                                    <th className="px-3 py-2.5 font-semibold">Bật</th>
                                    <th className="px-3 py-2.5 font-semibold">Tiêu đề</th>
                                    <th className="px-3 py-2.5 font-semibold">Bộ phận</th>
                                    <th className="px-3 py-2.5 font-semibold">Trạng thái</th>
                                    <th className="px-3 py-2.5 font-semibold">Ngày tạo</th>
                                    <th className="px-3 py-2.5 font-semibold text-center">Thao tác</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {examples.map(ex => (
                                    <Fragment key={ex.id}>
                                        <tr className={`hover:bg-muted/30 transition-colors ${!ex.is_active ? 'opacity-50' : ''}`}>
                                            <td className="px-3 py-2.5">
                                                <button
                                                    onClick={() => handleToggleActive(ex)}
                                                    title={ex.is_active ? 'Đang dùng — bấm để tắt' : 'Đang tắt — bấm để bật'}
                                                    className={`flex-shrink-0 w-10 h-5 rounded-full transition-colors relative ${ex.is_active ? 'bg-violet-500' : 'bg-muted-foreground/30'}`}
                                                >
                                                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${ex.is_active ? 'left-5' : 'left-0.5'}`} />
                                                </button>
                                            </td>
                                            <td className="px-3 py-2.5 font-medium">{ex.title}</td>
                                            <td className="px-3 py-2.5">
                                                {ex.dept_hint ? (
                                                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-mono">{ex.dept_hint}</span>
                                                ) : (
                                                    <span className="text-muted-foreground text-xs">—</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2.5">
                                                {ex.is_active ? (
                                                    <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-semibold">✓ Đang dùng</span>
                                                ) : (
                                                    <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">Tắt</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                                                {new Date(ex.created_at).toLocaleDateString('vi-VN')}
                                            </td>
                                            <td className="px-3 py-2.5 text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    <button
                                                        onClick={() => setExpandedId(expandedId === ex.id ? null : ex.id)}
                                                        className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border hover:bg-muted transition-colors"
                                                    >
                                                        {expandedId === ex.id ? '▲ Thu' : '▼ Xem'}
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(ex.id)}
                                                        className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded hover:bg-red-200 transition-colors"
                                                    >🗑</button>
                                                </div>
                                            </td>
                                        </tr>
                                        {expandedId === ex.id && (
                                            <tr>
                                                <td colSpan={6} className="bg-white px-4 py-4 border-t">
                                                    <div className="space-y-3">
                                                        <div>
                                                            <p className="text-xs font-semibold text-muted-foreground mb-1">📋 INPUT TEXT:</p>
                                                            <pre className="text-xs bg-muted/30 rounded-lg p-3 whitespace-pre-wrap font-mono border">{ex.input_text}</pre>
                                                        </div>
                                                        <div>
                                                            <p className="text-xs font-semibold text-muted-foreground mb-1">✅ EXPECTED JSON (tự sinh):</p>
                                                            <pre className="text-xs bg-green-50 rounded-lg p-3 whitespace-pre-wrap font-mono border border-green-100 text-green-800 overflow-x-auto">
                                                                {JSON.stringify(ex.expected_json, null, 2)}
                                                            </pre>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeCount >= 10 && (
                <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                    ⚠️ Đã có {activeCount} ví dụ active. AI sẽ dùng tối đa 10 ví dụ. Tắt bớt những ví dụ không cần thiết.
                </div>
            )}
        </div>
    )
}
"""

result = keep + new_part.encode('utf-8')
with open('src/app/(protected)/bao-com/page.tsx', 'wb') as f:
    f.write(result)
print('Done. New file size:', len(result), 'bytes')
