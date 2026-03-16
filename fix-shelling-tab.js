const fs = require('fs');
const filePath = 'src/app/(protected)/input/page.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// ─── 1. Remove the "Lines Shelling" tab trigger ───────────────────────────────
const tabTriggerLine = `                    {(role === 'admin' || Array.from(allowedDeptIds).some(id => departments.find(d => d.id === id)?.code === 'SHELL')) && <TabsTrigger value="shelling-lines">Lines Shelling</TabsTrigger>}\r\n`;
if (content.includes(tabTriggerLine)) {
    content = content.replace(tabTriggerLine, '');
    console.log('✓ Removed tab trigger');
} else {
    console.log('⚠ Tab trigger not found (may already be removed)');
}

// ─── 2. Remove the lines-shelling TabsContent block ───────────────────────────
// Find: {(role ... SHELL...) && (\n    <TabsContent value="shelling-lines"
const linesBlockStart = content.indexOf('\n                {(role === \'admin\' || Array.from(allowedDeptIds).some(id => departments.find(d => d.id === id)?.code === \'SHELL\')) && (\r\n                    <TabsContent value="shelling-lines"');
if (linesBlockStart !== -1) {
    // Find its closing: )} followed by end
    let depth = 0;
    let i = linesBlockStart + 1;
    let found = false;
    // Just find the </Tabs> that comes after this block  
    const afterBlock = content.indexOf('\r\n            </Tabs>', linesBlockStart);
    // The closing of our block would be right before </Tabs>
    const blockEnd = content.lastIndexOf('\r\n                )}', afterBlock);
    console.log('Removing block from', linesBlockStart, 'to', blockEnd + 20);
    content = content.slice(0, linesBlockStart) + content.slice(blockEnd + 20);
    console.log('✓ Removed shelling-lines TabsContent block');
} else {
    console.log('⚠ shelling-lines TabsContent not found');
}

// ─── 3. Replace the single actual_ton row with per-line inputs for SHELL ──────
const singleRowOld = `                                                                <TableRow>
                                                                    <TableCell className="font-medium align-middle">Sản lượng thực tế (Tấn)</TableCell>
                                                                    <TableCell className="p-2 align-middle">
                                                                        <FormField control={formActual.control} name="actual_ton" render={({ field }) => (
                                                                            <FormItem><FormControl><Input type="number" step="0.001" {...field} className="bg-transparent border-0 ring-offset-0 focus-visible:ring-1 shadow-none" /></FormControl></FormItem>
                                                                        )} />
                                                                    </TableCell>
                                                                </TableRow>`;

const singleRowNew = `                                                                {departments.find(d => d.id === selectedDept)?.code === 'SHELL' ? (
                                                                    <>
                                                                        <TableRow>
                                                                            <TableCell colSpan={2} className="p-0 pb-0">
                                                                                <div className="bg-blue-50/60 border-b px-4 pt-3 pb-1">
                                                                                    <p className="text-xs font-semibold text-blue-700 mb-2">📊 Sản lượng theo từng Line (Tấn)</p>
                                                                                    <div className="grid grid-cols-5 gap-2 mb-2">
                                                                                        {SHELLING_LINES.map(line => {
                                                                                            const lColors: Record<string, string> = { A: 'border-blue-400', B: 'border-green-400', C: 'border-amber-400', D: 'border-red-400', D1: 'border-purple-400' }
                                                                                            return (
                                                                                                <div key={line} className="flex flex-col items-center">
                                                                                                    <label className={\`text-[10px] font-bold mb-1 \${lColors[line].replace('border-','text-')}\`}>{line}</label>
                                                                                                    <input
                                                                                                        type="number" step="0.001" min="0"
                                                                                                        className={\`w-full text-right p-1 rounded border-2 \${lColors[line]} bg-white text-sm focus:outline-none\`}
                                                                                                        value={shellingLineData[line]?.actual_ton || ''}
                                                                                                        onChange={e => {
                                                                                                            const val = Number(e.target.value) || 0
                                                                                                            setShellingLineData(prev => {
                                                                                                                const next = { ...prev, [line]: { ...prev[line], actual_ton: val } }
                                                                                                                const total = SHELLING_LINES.reduce((s, l) => s + (next[l]?.actual_ton || 0), 0)
                                                                                                                formActual.setValue('actual_ton', total)
                                                                                                                return next
                                                                                                            })
                                                                                                        }}
                                                                                                    />
                                                                                                </div>
                                                                                            )
                                                                                        })}
                                                                                    </div>
                                                                                    <p className="text-[10px] font-semibold text-blue-800 text-right">
                                                                                        Tổng: <span className="text-base font-black">{SHELLING_LINES.reduce((s, l) => s + (shellingLineData[l]?.actual_ton || 0), 0).toFixed(3)}</span> T
                                                                                    </p>
                                                                                </div>
                                                                            </TableCell>
                                                                        </TableRow>
                                                                        <TableRow>
                                                                            <TableCell colSpan={2} className="p-0">
                                                                                <div className="bg-green-50/40 border-b px-4 pt-2 pb-3">
                                                                                    <p className="text-xs font-semibold text-green-700 mb-2">⏱ Thời gian chạy máy (Giờ)</p>
                                                                                    <div className="grid grid-cols-5 gap-2">
                                                                                        {SHELLING_LINES.map(line => (
                                                                                            <div key={line} className="flex flex-col items-center">
                                                                                                <label className="text-[10px] font-bold mb-1 text-gray-500">{line}</label>
                                                                                                <input
                                                                                                    type="number" step="0.1" min="0" max="24"
                                                                                                    className="w-full text-right p-1 rounded border-2 border-green-300 bg-white text-sm focus:outline-none"
                                                                                                    value={shellingLineData[line]?.run_hours || ''}
                                                                                                    onChange={e => setShellingLineData(prev => ({ ...prev, [line]: { ...prev[line], run_hours: Number(e.target.value) || 0 } }))}
                                                                                                />
                                                                                            </div>
                                                                                        ))}
                                                                                    </div>
                                                                                </div>
                                                                            </TableCell>
                                                                        </TableRow>
                                                                        <TableRow className="bg-blue-50">
                                                                            <TableCell className="font-semibold text-blue-800">Tổng sản lượng Shelling (Tấn)</TableCell>
                                                                            <TableCell className="p-2 align-middle">
                                                                                <FormField control={formActual.control} name="actual_ton" render={({ field }) => (
                                                                                    <FormItem><FormControl><Input type="number" step="0.001" {...field} readOnly className="bg-blue-50 border-0 ring-offset-0 focus-visible:ring-1 shadow-none font-bold text-blue-900" /></FormControl></FormItem>
                                                                                )} />
                                                                            </TableCell>
                                                                        </TableRow>
                                                                    </>
                                                                ) : (
                                                                    <TableRow>
                                                                        <TableCell className="font-medium align-middle">Sản lượng thực tế (Tấn)</TableCell>
                                                                        <TableCell className="p-2 align-middle">
                                                                            <FormField control={formActual.control} name="actual_ton" render={({ field }) => (
                                                                                <FormItem><FormControl><Input type="number" step="0.001" {...field} className="bg-transparent border-0 ring-offset-0 focus-visible:ring-1 shadow-none" /></FormControl></FormItem>
                                                                            )} />
                                                                        </TableCell>
                                                                    </TableRow>
                                                                )}`;

// Normalize the search target to also use CRLF
const singleRowOldCRLF = singleRowOld.replace(/\n/g, '\r\n');
if (content.includes(singleRowOldCRLF)) {
    content = content.replace(singleRowOldCRLF, singleRowNew.replace(/\n/g, '\r\n'));
    console.log('✓ Replaced single actual_ton row with per-line UI for SHELL');
} else {
    console.log('⚠ Could not find single actual_ton row to replace');
    // Try without CRLF normalization
    if (content.includes(singleRowOld)) {
        content = content.replace(singleRowOld, singleRowNew);
        console.log('✓ Replaced (LF version)');
    }
}

// ─── 4. Also save shellingLineData when Actual is saved ───────────────────────
// The onSubmitActual function needs to also upsert shelling_line_daily
// Find the onSubmitActual function and add the upsert call
const onSubmitActualEnd = `            toast.success('Đã lưu Actual thành công!')\r\n            fetchRecords()`;
const onSubmitActualEndNew = `            toast.success('Đã lưu Actual thành công!')\r\n            fetchRecords()\r\n            // Also save shelling line data if Shelling dept\r\n            const deptCodeNow = departments.find(d => d.id === selectedDept)?.code\r\n            if (deptCodeNow === 'SHELL') saveShellingLines()`;
if (content.includes(onSubmitActualEnd)) {
    content = content.replace(onSubmitActualEnd, onSubmitActualEndNew);
    console.log('✓ Added auto-save of shelling line data on Actual save');
} else {
    console.log('⚠ Could not find onSubmitActual end marker');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('\nDone! File written.');
