import re

path = r'c:\Users\Cashew\.gemini\PPE\factory-dashboard\src\app\(protected)\bao-com\page.tsx'

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

original_len = len(content)

# ── Patch 3: Insert Source + Confirm cols after DB Link td, before </tr> in records.map ──
# We're targeting the row end at char ~120000-120009 in the file
# Pattern: the end of the isUnknown select section closing + </td> </tr> ) })}
# The exact chars just before parse-tab tfoot (idx=120651 in current file)

old_row_end = '''                                                                 ) : (
                                                                     <span className="text-xs text-muted-foreground">\u2014</span>
                                                                 )}
                                                             </td>
                                                        </tr>
                                                    )
                                                })}
                                            </tbody>
                                            <tfoot>'''

new_row_end = '''                                                                 ) : (
                                                                     <span className="text-xs text-muted-foreground">\u2014</span>
                                                                 )}
                                                             </td>
                                                             {/* Source toggle */}
                                                             <td className="px-2 py-2 text-center">
                                                                 {r.raw ? (
                                                                     <button
                                                                         onClick={() => toggleSource(i)}
                                                                         title="Xem ngu\u1ed3n"
                                                                         className={`text-xs px-1.5 py-0.5 rounded border transition-colors ${
                                                                             expandedSource.has(i)
                                                                                 ? 'bg-slate-200 border-slate-400 text-slate-700'
                                                                                 : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                                                                         }`}
                                                                     >
                                                                         {expandedSource.has(i) ? '\u25b2 \u1ea8n' : '\u25bc Xem'}
                                                                     </button>
                                                                 ) : <span className="text-muted-foreground text-xs">\u2014</span>}
                                                             </td>
                                                             {/* Per-row confirm */}
                                                             <td className="px-2 py-2 text-center">
                                                                 {canSave && (
                                                                     confirmedRows.has(i) ? (
                                                                         <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                                                                             <CheckCircle2 className="h-3 w-3" /> \u0110\u00e3 l\u01b0u
                                                                         </span>
                                                                     ) : (
                                                                         <button
                                                                             onClick={() => handleConfirmOne(i)}
                                                                             disabled={confirmingRow === i}
                                                                             className="text-xs font-semibold px-2.5 py-0.5 rounded-full border bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-600 hover:text-white transition-colors disabled:opacity-50"
                                                                         >
                                                                             {confirmingRow === i ? '...' : '\u2713 L\u01b0u'}
                                                                         </button>
                                                                     )
                                                                 )}
                                                                 {confirmMsg[i] && !confirmedRows.has(i) && (
                                                                     <div className={`text-[10px] mt-0.5 ${
                                                                         confirmMsg[i].type === 'ok' ? 'text-emerald-600' : 'text-red-500'
                                                                     }`}>{confirmMsg[i].text}</div>
                                                                 )}
                                                             </td>
                                                        </tr>
                                                        {/* Expandable source row */}
                                                        {expandedSource.has(i) && r.raw && (
                                                            <tr className="bg-slate-50 border-b border-slate-100">
                                                                <td colSpan={13} className="px-4 py-2">
                                                                    <div className="flex items-start gap-2">
                                                                        <span className="text-[10px] font-bold uppercase text-slate-400 mt-0.5 shrink-0">Ngu\u1ed3n:</span>
                                                                        <pre className="text-xs text-slate-600 whitespace-pre-wrap font-mono bg-white border border-slate-200 rounded-lg px-3 py-2 flex-1 leading-relaxed">{r.raw}</pre>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        )}
                                                    )
                                                })}
                                            </tbody>
                                            <tfoot>'''

if old_row_end in content:
    content = content.replace(old_row_end, new_row_end, 1)
    print("✓ Patch 3: source+confirm cols added")
else:
    print("✗ Patch 3: STILL not found, dumping surrounding...")
    # Find the exact chars
    search = '                                                                     <span className="text-xs text-muted-foreground">'
    idx = content.rfind(search, 0, 121000)
    print(f"Found at: {idx}")
    print(repr(content[idx:idx+600]))

# ── Patch 4: tfoot - add 2 empty tds ──
old_tfoot_end = '''                                                     <td />
                                                 </tr>
                                             </tfoot>'''
# There may be multiple. Target is in the parse tab (3rd tfoot)
count_before = content[:120000].count(old_tfoot_end) if old_tfoot_end in content else 0
print(f"tfoot <td /> pattern occurrences: {content.count(old_tfoot_end)} (before char 120000: {count_before})")

if old_tfoot_end in content:
    # Replace the LAST one before the 4th tfoot (monthly stats)
    last_parse_tfoot_end = content.rfind(old_tfoot_end, 0, 140000)
    if last_parse_tfoot_end != -1:
        new_tfoot_end = '''                                                     <td />
                                                     <td />
                                                     <td />
                                                 </tr>
                                             </tfoot>'''
        content = content[:last_parse_tfoot_end] + new_tfoot_end + content[last_parse_tfoot_end + len(old_tfoot_end):]
        print("✓ Patch 4: tfoot updated")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

new_len = len(content)
print(f"\nDone. File size: {original_len} → {new_len} chars (+{new_len - original_len})")
