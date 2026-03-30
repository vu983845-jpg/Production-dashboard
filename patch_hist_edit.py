"""
Patch bao-com/page.tsx — History pivot table: add "Edit" button per row.
Clicking 'Edit' will switch to kitchen tab and set summaryDate + summaryShift
to the most recent date of that row (latest day with data), then fetch.
"""

content = open('src/app/(protected)/bao-com/page.tsx', 'rb').read()
text = content.decode('utf-8')

# ── Fix 1: Change "Xóa" header column to "Sửa / Xóa" ────────────────────────
old_hdr = '{canSave && <th className="px-2 py-2 text-center font-semibold text-red-400 min-w-[44px]">Xóa</th>}'
new_hdr = '{canSave && <th className="px-2 py-2 text-center font-semibold text-muted-foreground min-w-[72px]">Sửa / Xóa</th>}'
assert old_hdr in text, "header anchor not found"
text = text.replace(old_hdr, new_hdr, 1)

# ── Fix 2: Replace delete-only cell with edit + delete cells ─────────────────
old_cell = (
    '                                                    {canSave && (\r\n'
    '                                                        <td className="px-2 py-2 text-center">\r\n'
    '                                                            <button\r\n'
    '                                                                onClick={async () => {\r\n'
    '                                                                    if (!confirm(`Xóa TẤT CẢ bản ghi của "${row.deptName}" Ca ${row.shift} trong khoảng ngày đã chọn?`)) return\r\n'
    '                                                                    const ids = historyRecords\r\n'
    '                                                                        .filter(r => (r.department_id ?? r.department_name) + \'|\' + r.shift === key)\r\n'
    '                                                                        .map(r => r.id)\r\n'
    '                                                                    await supabase.from(\'meal_headcount\').delete().in(\'id\', ids)\r\n'
    '                                                                    setHistoryRecords(prev => prev.filter(r => !ids.includes(r.id)))\r\n'
    '                                                                }}\r\n'
    '                                                                className="text-red-400 hover:text-red-600 hover:bg-red-50 rounded px-1.5 py-0.5 text-xs transition-colors"\r\n'
    '                                                                title="Xóa hàng này"\r\n'
    '                                                            >\r\n'
    '                                                                🗑\r\n'
    '                                                            </button>\r\n'
    '                                                        </td>\r\n'
    '                                                    )}\r\n'
)
new_cell = (
    '                                                    {canSave && (\r\n'
    '                                                        <td className="px-2 py-2 text-center">\r\n'
    '                                                            <div className="flex items-center justify-center gap-1">\r\n'
    '                                                                {/* Edit: go to kitchen tab for the latest date of this row */}\r\n'
    '                                                                <button\r\n'
    '                                                                    onClick={() => {\r\n'
    '                                                                        // Find the most recent date that has data for this row\r\n'
    '                                                                        const latestDay = [...row.days.entries()]\r\n'
    '                                                                            .filter(([, v]) => v.present > 0)\r\n'
    '                                                                            .sort(([a], [b]) => b.localeCompare(a))[0]?.[0]\r\n'
    '                                                                        if (latestDay) {\r\n'
    '                                                                            setSummaryDate(latestDay)\r\n'
    '                                                                            setSummaryShift(row.shift === \'OT\' ? \'1\' : row.shift)\r\n'
    '                                                                        }\r\n'
    '                                                                        setActiveTab(\'kitchen\')\r\n'
    '                                                                    }}\r\n'
    '                                                                    className="text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded px-1.5 py-0.5 text-xs transition-colors"\r\n'
    '                                                                    title="Sửa số liệu"\r\n'
    '                                                                >\r\n'
    '                                                                    ✏️\r\n'
    '                                                                </button>\r\n'
    '                                                                {/* Delete */}\r\n'
    '                                                                <button\r\n'
    '                                                                    onClick={async () => {\r\n'
    '                                                                        if (!confirm(`Xóa TẤT CẢ bản ghi của "${row.deptName}" Ca ${row.shift} trong khoảng ngày đã chọn?`)) return\r\n'
    '                                                                        const ids = historyRecords\r\n'
    '                                                                            .filter(r => (r.department_id ?? r.department_name) + \'|\' + r.shift === key)\r\n'
    '                                                                            .map(r => r.id)\r\n'
    '                                                                        await supabase.from(\'meal_headcount\').delete().in(\'id\', ids)\r\n'
    '                                                                        setHistoryRecords(prev => prev.filter(r => !ids.includes(r.id)))\r\n'
    '                                                                    }}\r\n'
    '                                                                    className="text-red-400 hover:text-red-600 hover:bg-red-50 rounded px-1.5 py-0.5 text-xs transition-colors"\r\n'
    '                                                                    title="Xóa hàng này"\r\n'
    '                                                                >\r\n'
    '                                                                    🗑\r\n'
    '                                                                </button>\r\n'
    '                                                            </div>\r\n'
    '                                                        </td>\r\n'
    '                                                    )}\r\n'
)
assert old_cell in text, "delete cell anchor not found"
text = text.replace(old_cell, new_cell, 1)

open('src/app/(protected)/bao-com/page.tsx', 'wb').write(text.encode('utf-8'))
print('Done. New size:', len(text.encode('utf-8')))
