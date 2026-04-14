import sys
import re

with open(r'c:\Users\Cashew\.gemini\PPE\factory-dashboard\src\app\(protected)\input\page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace block 1
block1_regex = re.compile(
    r"\s*\)\s*:\s*departments\.find\(d\s*=>\s*d\.id\s*===\s*selectedDept\)\?\.code\s*===\s*'PEEL_MC'\s*\?\s*\(\s*<>\s*<TableRow>\s*<TableCell\s*className=\"font-medium\s*align-middle\s*text-blue-700\">\s*Pass\s*1\s*—\s*Tổng\s*3\s*ca\s*\(Tấn\)\s*</TableCell>.*?</>\s*\)\s*:",
    re.DOTALL
)

replacement1 = """                                                                  ) : departments.find(d => d.id === selectedDept)?.code === 'PEEL_MC' ? (    
                                                                      <>    
                                                                          <TableRow className="bg-emerald-50">    
                                                                              <TableCell className="font-semibold text-emerald-800">Tổng sản lượng Các Size (Tấn)</TableCell>    
                                                                              <TableCell className="p-2 align-middle">    
                                                                                  <FormField control={formActual.control} name="actual_ton" render={({ field }) => (    
                                                                                      <FormItem><FormControl><Input type="number" step="0.001" {...field} readOnly className="bg-emerald-50 border-0 ring-offset-0 shadow-none font-bold text-emerald-900 cursor-not-allowed" /></FormControl></FormItem>    
                                                                                  )} />    
                                                                              </TableCell>    
                                                                          </TableRow>    
                                                                      </>    
                                                                  ) :"""

content, n1 = block1_regex.subn(replacement1, content)
print(f"Replaced block 1 {n1} times")

# Replace block 2
block2_regex = re.compile(
    r"\s*\{\/\*\s*──\s*Peeling\s*3-shift\s*breakdown\s*card\s*──\s*\*\/\}.*?\{\/\*\s*──\s*Color\s*Sorter\s*2-shift\s*breakdown\s*card\s*──\s*\*\/\}",
    re.DOTALL
)

replacement2 = """                                    {/* ── Peeling breakdown card ── */}
                                    {departments.find(d => d.id === selectedDept)?.code === 'PEEL_MC' && (
                                        <div className="rounded-xl border bg-card text-card-foreground shadow mt-4">
                                            <div className="p-6 space-y-4">
                                                <div className="flex justify-between items-center">
                                                    <div>
                                                        <h3 className="font-semibold text-lg text-emerald-800">📊 Chi tiết Các Size — Peeling MC</h3>
                                                        <p className="text-sm text-muted-foreground">Nhập sản lượng, bể, unpeel theo từng size, sau đó bấm <strong>Lưu Các Size</strong></p>
                                                    </div>
                                                    <Button onClick={savePeelingLines} disabled={isSaving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                                                        <Save className="mr-2 h-4 w-4" />
                                                        {isSaving ? 'Đang lưu...' : 'Lưu Các Size'}
                                                    </Button>
                                                </div>

                                                {/* Tổ trưởng */}
                                                <div className="grid grid-cols-3 gap-4">
                                                    {(['Ca 1', 'Ca 2', 'Ca 3'] as PeelShift[]).map(shift => (
                                                        <div key={shift} className="space-y-1">
                                                            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tổ trưởng {shift}</Label>
                                                            <Select value={peelingShiftLeaders[shift]} onValueChange={v => setPeelingShiftLeaders(prev => ({ ...prev, [shift]: v }))}>
                                                                <SelectTrigger className="bg-white"><SelectValue placeholder="Chọn tổ trưởng..." /></SelectTrigger>
                                                                <SelectContent>{PEEL_SHIFT_LEADERS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                                                            </Select>
                                                        </div>
                                                    ))}
                                                </div>

                                                {/* Grid Data */}
                                                <div className="rounded-md border overflow-hidden bg-white">
                                                    <Table>
                                                        <TableBody>
                                                            <TableRow>
                                                                <TableCell colSpan={2} className="p-0">
                                                                    {/* Sản lượng */}
                                                                    <div className="bg-blue-50/40 border-b px-4 pt-2 pb-3">
                                                                        <p className="text-xs font-semibold text-blue-700 mb-2">📦 Sản lượng thực tế (Tấn)</p>
                                                                        {(['Ca 1', 'Ca 2', 'Ca 3'] as PeelShift[]).map(shift => (
                                                                            <div key={shift} className="mb-3">
                                                                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">{shift}</span>
                                                                                <div className="grid grid-cols-5 gap-2">
                                                                                    {PEELING_LINES.map(line => (
                                                                                        <div key={`${line}-${shift}`} className="flex flex-col items-center">
                                                                                            <label className="text-[10px] font-bold mb-1 text-gray-500">{line}</label>
                                                                                            <input
                                                                                                type="number" step="0.001" min="0"
                                                                                                className="w-full text-right p-1 rounded border-2 border-blue-200 bg-white text-sm focus:outline-none focus:border-blue-500"
                                                                                                value={peelingLineData[line]?.[shift]?.actual_ton || ''}
                                                                                                onChange={e => setPeelingLineData(prev => ({ ...prev, [line]: { ...prev[line], [shift]: { ...prev[line][shift], actual_ton: Number(e.target.value) || 0 } } }))}
                                                                                            />
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </TableCell>
                                                            </TableRow>
                                                            
                                                            <TableRow>
                                                                <TableCell colSpan={2} className="p-0">
                                                                    {/* Bể */}
                                                                    <div className="bg-red-50/40 border-b px-4 pt-2 pb-3">
                                                                        <p className="text-xs font-semibold text-red-700 mb-2">💔 Tỷ lệ Bể (% Broken)</p>
                                                                        {(['Ca 1', 'Ca 2', 'Ca 3'] as PeelShift[]).map(shift => (
                                                                            <div key={shift} className="mb-3">
                                                                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">{shift}</span>
                                                                                <div className="grid grid-cols-5 gap-2">
                                                                                    {PEELING_LINES.map(line => (
                                                                                        <div key={`${line}-${shift}`} className="flex flex-col items-center">
                                                                                            <label className="text-[10px] font-bold mb-1 text-gray-500">{line}</label>
                                                                                            <input
                                                                                                type="number" step="0.1" min="0" max="100"
                                                                                                className="w-full text-right p-1 rounded border-2 border-red-200 bg-white text-sm focus:outline-none focus:border-red-500"
                                                                                                value={peelingLineData[line]?.[shift]?.broken_pct || ''}
                                                                                                onChange={e => setPeelingLineData(prev => ({ ...prev, [line]: { ...prev[line], [shift]: { ...prev[line][shift], broken_pct: Number(e.target.value) || 0 } } }))}
                                                                                            />
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </TableCell>
                                                            </TableRow>

                                                            <TableRow>
                                                                <TableCell colSpan={2} className="p-0">
                                                                    {/* Sót lụa */}
                                                                    <div className="bg-orange-50/40 border-b px-4 pt-2 pb-3">
                                                                        <p className="text-xs font-semibold text-orange-700 mb-2">🧡 Tỷ lệ Sót lụa (% Unpeel)</p>
                                                                        {(['Ca 1', 'Ca 2', 'Ca 3'] as PeelShift[]).map(shift => (
                                                                            <div key={shift} className="mb-3">
                                                                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">{shift}</span>
                                                                                <div className="grid grid-cols-5 gap-2">
                                                                                    {PEELING_LINES.map(line => (
                                                                                        <div key={`${line}-${shift}`} className="flex flex-col items-center">
                                                                                            <label className="text-[10px] font-bold mb-1 text-gray-500">{line}</label>
                                                                                            <input
                                                                                                type="number" step="0.1" min="0" max="100"
                                                                                                className="w-full text-right p-1 rounded border-2 border-orange-200 bg-white text-sm focus:outline-none focus:border-orange-500"
                                                                                                value={peelingLineData[line]?.[shift]?.unpeel_pct || ''}
                                                                                                onChange={e => setPeelingLineData(prev => ({ ...prev, [line]: { ...prev[line], [shift]: { ...prev[line][shift], unpeel_pct: Number(e.target.value) || 0 } } }))}
                                                                                            />
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </TableCell>
                                                            </TableRow>
                                                            <TableRow>
                                                                <TableCell colSpan={2} className="p-0">
                                                                    <div className="bg-emerald-50/40 px-4 pt-2 pb-3">
                                                                        <div className="flex gap-4 items-center">
                                                                            <p className="text-sm font-semibold text-emerald-800 shrink-0">Tổng Sản Lượng (Ca 1+2+3):</p>
                                                                            <div className="flex-1 text-xl font-black text-emerald-900 border-b-2 border-emerald-300 pb-1">
                                                                                {PEELING_LINES.reduce((sL, l) => sL + (['Ca 1', 'Ca 2', 'Ca 3'] as PeelShift[]).reduce((sS, sh) => sS + (peelingLineData[l]?.[sh]?.actual_ton || 0), 0), 0).toFixed(3)} Tấn
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </TableCell>
                                                            </TableRow>
                                                        </TableBody>
                                                    </Table>
                                                </div>
                                            </div>
                                        </div>
                                    {/* ── Color Sorter 2-shift breakdown card ── */}"""

content, n2 = block2_regex.subn(replacement2, content)
print(f"Replaced block 2 {n2} times")

with open(r'c:\Users\Cashew\.gemini\PPE\factory-dashboard\src\app\(protected)\input\page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
