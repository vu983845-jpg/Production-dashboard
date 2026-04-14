const fs = require('fs');
const path = require('path');

const filePath = path.join('src', 'app', '(protected)', 'input', 'page.tsx');
let c = fs.readFileSync(filePath, 'utf8');

// Find the insertion point: after </TableRow> before the Broken section
// The unique marker is the Broken section header
const marker = '<TableRow>\r\r\n                                                                <TableCell colSpan={2} className=\"p-0\">\r\r\n                                                                    {/* B\u1ec3 */}';
const markerAlt = '<TableRow>\n                                                                <TableCell colSpan={2} className="p-0">\n                                                                    {/* B\u1ec3 */}';

const pass2Section = `<TableRow>
                                                                <TableCell colSpan={2} className="p-0">
                                                                    <div className="bg-purple-50/40 border-b px-4 pt-2 pb-3">
                                                                        <p className="text-xs font-semibold text-purple-700 mb-2">♻️ Sản lượng Hàng 2 Pass (Tấn)</p>
                                                                        {(['Ca 1', 'Ca 2', 'Ca 3'] as PeelShift[]).map(shift => (
                                                                            <div key={shift} className="mb-3">
                                                                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">{shift}</span>
                                                                                <div className="grid grid-cols-5 gap-2">
                                                                                    {PEELING_LINES.map(line => (
                                                                                        <div key={\`p2-\${line}-\${shift}\`} className="flex flex-col items-center">
                                                                                            <label className="text-[10px] font-bold mb-1 text-gray-500">{line}</label>
                                                                                            <input
                                                                                                type="number" step="0.001" min="0"
                                                                                                className="w-full text-right p-1 rounded border-2 border-purple-200 bg-white text-sm focus:outline-none focus:border-purple-500"
                                                                                                value={peelingLineData[line]?.[shift]?.pass2_ton || ''}
                                                                                                onChange={e => setPeelingLineData(prev => ({ ...prev, [line]: { ...prev[line], [shift]: { ...prev[line][shift], pass2_ton: Number(e.target.value) || 0 } } }))}
                                                                                            />
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </TableCell>
                                                            </TableRow>\n\n                                                            `;

// Try both endings
let found = false;
if (c.includes(marker)) {
    c = c.replace(marker, pass2Section + marker);
    console.log('Inserted with \\r\\r\\n marker');
    found = true;
} else if (c.includes(markerAlt)) {
    c = c.replace(markerAlt, pass2Section + markerAlt);
    console.log('Inserted with \\n marker');
    found = true;
}

if (!found) {
    // Search for Broken section manually to debug
    const idx = c.indexOf('T\u1ef7 l\u1ec7 B\u1ec3');
    console.error('Marker not found! B\u1ec3 at:', idx);
    if (idx > -1) {
        console.log('Context around B\u1ec3:', JSON.stringify(c.substring(idx-200, idx+50)));
    }
    process.exit(1);
}

fs.writeFileSync(filePath, c, 'utf8');
console.log('UI Pass2 section inserted successfully');
