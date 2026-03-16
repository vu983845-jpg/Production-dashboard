const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/app/(protected)/input/page.tsx');
let content = fs.readFileSync(filePath, 'utf8');

const newTabContent = `
                {(role === 'admin' || Array.from(allowedDeptIds).some(id => departments.find(d => d.id === id)?.code === 'SHELL')) && (
                    <TabsContent value="shelling-lines" className="space-y-4">
                        <div className="rounded-xl border bg-card text-card-foreground shadow overflow-hidden">
                            <div className="p-6">
                                <div className="flex justify-between items-center mb-4">
                                    <div>
                                        <h3 className="font-semibold text-lg">Shelling Lines \u2014 {format(date, "dd/MM/yyyy")}</h3>
                                        <p className="text-sm text-muted-foreground mt-1">Nh\u1eadp s\u1ea3n l\u01b0\u1ee3ng v\u00e0 th\u1eddi gian ch\u1ea1y m\u00e1y cho t\u1eebng line c\u1eaft trong ng\u00e0y</p>
                                    </div>
                                    <Button onClick={saveShellingLines} disabled={isSaving} size="sm">
                                        <Save className="mr-2 h-4 w-4" />
                                        {isSaving ? '\u0110ang l\u01b0u...' : 'L\u01b0u Lines'}
                                    </Button>
                                </div>
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader className="bg-muted">
                                            <TableRow>
                                                <TableHead className="w-[80px] text-center font-bold">Line</TableHead>
                                                <TableHead className="text-center">S\u1ea3n l\u01b0\u1ee3ng (T\u1ea5n)</TableHead>
                                                <TableHead className="text-center">TG Ch\u1ea1y M\u00e1y (Gi\u1edd)</TableHead>
                                                <TableHead className="text-center bg-green-50 text-green-700">Hi\u1ec7u su\u1ea5t (T/Gi\u1edd)</TableHead>
                                                <TableHead className="text-center">Ghi ch\u00fa</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {SHELLING_LINES.map(line => {
                                                const entry = shellingLineData[line]
                                                const efficiency = entry.run_hours > 0 ? (entry.actual_ton / entry.run_hours).toFixed(2) : '\u2014'
                                                return (
                                                    <TableRow key={line}>
                                                        <TableCell className="text-center font-bold text-lg text-primary">{line}</TableCell>
                                                        <TableCell className="p-2">
                                                            <input
                                                                type="number" step="0.001" min="0"
                                                                className="w-full text-right p-2 rounded border border-input bg-transparent text-sm focus:ring-1 focus:ring-primary outline-none"
                                                                value={entry.actual_ton || ''}
                                                                onChange={e => setShellingLineData(prev => ({ ...prev, [line]: { ...prev[line], actual_ton: Number(e.target.value) } }))}
                                                            />
                                                        </TableCell>
                                                        <TableCell className="p-2">
                                                            <input
                                                                type="number" step="0.1" min="0" max="24"
                                                                className="w-full text-right p-2 rounded border border-input bg-transparent text-sm focus:ring-1 focus:ring-primary outline-none"
                                                                value={entry.run_hours || ''}
                                                                onChange={e => setShellingLineData(prev => ({ ...prev, [line]: { ...prev[line], run_hours: Number(e.target.value) } }))}
                                                            />
                                                        </TableCell>
                                                        <TableCell className="text-center bg-green-50">
                                                            <span className={\`font-bold text-sm \${entry.run_hours > 0 ? 'text-green-700' : 'text-muted-foreground'}\`}>
                                                                {efficiency} {entry.run_hours > 0 ? 'T/h' : ''}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell className="p-2">
                                                            <input
                                                                type="text"
                                                                className="w-full p-2 rounded border border-input bg-transparent text-sm focus:ring-1 focus:ring-primary outline-none"
                                                                placeholder="Ghi ch\u00fa..."
                                                                value={entry.note || ''}
                                                                onChange={e => setShellingLineData(prev => ({ ...prev, [line]: { ...prev[line], note: e.target.value } }))}
                                                            />
                                                        </TableCell>
                                                    </TableRow>
                                                )
                                            })}
                                            <TableRow className="bg-muted/30 font-semibold">
                                                <TableCell className="text-center text-sm text-muted-foreground">T\u1ed4NG</TableCell>
                                                <TableCell className="text-right text-primary font-bold pr-4">
                                                    {SHELLING_LINES.reduce((s, l) => s + (shellingLineData[l].actual_ton || 0), 0).toFixed(3)} T
                                                </TableCell>
                                                <TableCell className="text-right text-amber-700 font-bold pr-4">
                                                    {SHELLING_LINES.reduce((s, l) => s + (shellingLineData[l].run_hours || 0), 0).toFixed(1)} Gi\u1edd
                                                </TableCell>
                                                <TableCell className="text-center bg-green-50 text-green-700 font-bold">
                                                    {(() => { const tot = SHELLING_LINES.reduce((s, l) => s + (shellingLineData[l].actual_ton || 0), 0); const hrs = SHELLING_LINES.reduce((s, l) => s + (shellingLineData[l].run_hours || 0), 0); return hrs > 0 ? (tot / hrs).toFixed(2) + ' T/h' : '\u2014' })()}
                                                </TableCell>
                                                <TableCell />
                                            </TableRow>
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>
                        </div>
                    </TabsContent>
                )}`;

// The shelling energy TabsContent ends at the closing )} before </Tabs>
// We want to insert before the last )} + </Tabs> combo
const insertBefore = '\n            </Tabs>';

const idx = content.lastIndexOf(insertBefore);
if (idx === -1) {
    console.error('Marker not found!');
    process.exit(1);
}

const newContent = content.slice(0, idx) + newTabContent + content.slice(idx);
fs.writeFileSync(filePath, newContent, 'utf8');
console.log('Done! New length:', newContent.length);
