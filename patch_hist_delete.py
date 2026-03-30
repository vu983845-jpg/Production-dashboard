"""
Patch bao-com/page.tsx — History tab:
1. Add delete button column to pivot table (per-cell, shows when hovering a date cell)
2. Actually: simpler approach — add a "Xóa bản ghi" action column at the right
   showing per-row delete button that opens a confirm then calls handleHistDelete
"""

content = open('src/app/(protected)/bao-com/page.tsx', 'rb').read()
text = content.decode('utf-8')

NL = '\r\n'

# ── Fix 1: Add delete button to history pivot table ──────────────────────────
# We'll add a new column header "Xóa" to the pivot table header
old_header = (
    '                                            <th className="px-2 py-2 text-center font-bold min-w-[48px] text-primary">TỔNG</th>\r\n'
    '                                        </tr>\r\n'
    '                                    </thead>'
)
new_header = (
    '                                            <th className="px-2 py-2 text-center font-bold min-w-[48px] text-primary">TỔNG</th>\r\n'
    '                                            {canSave && <th className="px-2 py-2 text-center font-semibold text-red-400 min-w-[44px]">Xóa</th>}\r\n'
    '                                        </tr>\r\n'
    '                                    </thead>'
)
assert old_header in text, "pivot header not found"
text = text.replace(old_header, new_header, 1)

# ── Fix 2: Add Xóa cell and total cell to each pivot row ─────────────────────
old_row_end = (
    '                                                    <td className="px-2 py-2 text-center font-bold text-primary border-l">{rowTotal || \'—\'}</td>\r\n'
    '                                                </tr>'
)
new_row_end = (
    '                                                    <td className="px-2 py-2 text-center font-bold text-primary border-l">{rowTotal || \'—\'}</td>\r\n'
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
    '                                                </tr>'
)
assert old_row_end in text, "pivot row end not found"
text = text.replace(old_row_end, new_row_end, 1)

# ── Fix 3: Add empty Xóa cell to TỔNG footer row ─────────────────────────────
old_footer_end = (
    '                                            <td className="px-2 py-2 text-center text-primary border-l">\r\n'
    '                                                {historyRecords.reduce((s, r) => s + (r.official_present ?? 0) + (r.seasonal_present ?? 0), 0)}\r\n'
    '                                            </td>\r\n'
    '                                        </tr>\r\n'
    '                                    </tfoot>'
)
new_footer_end = (
    '                                            <td className="px-2 py-2 text-center text-primary border-l">\r\n'
    '                                                {historyRecords.reduce((s, r) => s + (r.official_present ?? 0) + (r.seasonal_present ?? 0), 0)}\r\n'
    '                                            </td>\r\n'
    '                                            {canSave && <td />}\r\n'
    '                                        </tr>\r\n'
    '                                    </tfoot>'
)
assert old_footer_end in text, "pivot footer not found"
text = text.replace(old_footer_end, new_footer_end, 1)

open('src/app/(protected)/bao-com/page.tsx', 'wb').write(text.encode('utf-8'))
print('Done. New size:', len(text.encode('utf-8')))
