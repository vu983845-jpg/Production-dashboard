const fs = require('fs');

let c = fs.readFileSync('src/app/(protected)/input/page.tsx', 'utf8');

const missingCells = `
                                                        <TableCell className="border-r p-1 bg-amber-50/10 relative pb-4">
                                                            <input type="number" step="0.01" className="w-full text-right p-1 rounded border-gray-200 outline-none focus:ring-1 focus:ring-amber-400 bg-transparent text-sm font-semibold"
                                                                value={row.meter_peak !== undefined ? row.meter_peak : ''}
                                                                onChange={(e) => {
                                                                    const val = e.target.value === '' ? undefined : Number(e.target.value);
                                                                    const newData = [...monthlyEnergyData];
                                                                    newData[index].meter_peak = val;
                                                                    setMonthlyEnergyData(recalcEnergyData(newData));
                                                                }} />
                                                            {row.electricity_peak_kwh !== undefined && <div className="text-[10px] text-amber-600 text-center absolute bottom-0 left-0 right-0">{row.electricity_peak_kwh} kWh</div>}
                                                        </TableCell>
                                                        <TableCell className="border-r p-1 bg-amber-50/10 relative pb-4">
                                                            <input type="number" step="0.01" className="w-full text-right p-1 rounded border-gray-200 outline-none focus:ring-1 focus:ring-amber-400 bg-transparent text-sm font-semibold"
                                                                value={row.meter_normal !== undefined ? row.meter_normal : ''}
                                                                onChange={(e) => {
                                                                    const val = e.target.value === '' ? undefined : Number(e.target.value);
                                                                    const newData = [...monthlyEnergyData];
                                                                    newData[index].meter_normal = val;
                                                                    setMonthlyEnergyData(recalcEnergyData(newData));
                                                                }} />
                                                            {row.electricity_normal_kwh !== undefined && <div className="text-[10px] text-amber-600 text-center absolute bottom-0 left-0 right-0">{row.electricity_normal_kwh} kWh</div>}
                                                        </TableCell>
                                                        <TableCell className="border-r p-1 bg-amber-50/10 relative pb-4">
                                                            <input type="number" step="0.01" className="w-full text-right p-1 rounded border-gray-200 outline-none focus:ring-1 focus:ring-amber-400 bg-transparent text-sm font-semibold"
                                                                value={row.meter_offpeak !== undefined ? row.meter_offpeak : ''}
                                                                onChange={(e) => {
                                                                    const val = e.target.value === '' ? undefined : Number(e.target.value);
                                                                    const newData = [...monthlyEnergyData];
                                                                    newData[index].meter_offpeak = val;
                                                                    setMonthlyEnergyData(recalcEnergyData(newData));
                                                                }} />
                                                            {row.electricity_offpeak_kwh !== undefined && <div className="text-[10px] text-amber-600 text-center absolute bottom-0 left-0 right-0">{row.electricity_offpeak_kwh} kWh</div>}
                                                        </TableCell>
`;

// Insert the missing cells after the electricity_meter_reading TableCell.
// We must find the end of the `electricity_meter_reading` TableCell and insert BEFORE the `electricity_kwh` TableCell.

const boundaryString = `                                                            {nextRowElec != null && <div className="text-[9px] text-amber-600 text-center absolute bottom-0 left-0 right-0">Trừ từ sau: {nextRowElec}</div>}
                                                        </TableCell>
                                                        <TableCell className="border-r p-1">
                                                            <input type="number" step="0.01" className={cn("w-full text-right p-1 rounded font-semibold outline-none text-sm", nextRowElec != null ? "bg-amber-50" : "bg-transparent focus:ring-1 focus:ring-amber-400")}
                                                                readOnly={nextRowElec != null}
                                                                value={row.electricity_kwh || ''}`;

if (c.includes(boundaryString) && !c.includes('row.meter_peak !== undefined')) {
    const replacementString = `                                                            {nextRowElec != null && <div className="text-[9px] text-amber-600 text-center absolute bottom-0 left-0 right-0">Trừ từ sau: {nextRowElec}</div>}
                                                        </TableCell>${missingCells}
                                                        <TableCell className="border-r p-1">
                                                            <input type="number" step="0.01" className={cn("w-full text-right p-1 rounded font-semibold outline-none text-sm", nextRowElec != null ? "bg-amber-50" : "bg-transparent focus:ring-1 focus:ring-amber-400")}
                                                                readOnly={nextRowElec != null}
                                                                value={row.electricity_kwh || ''}`;
    c = c.replace(boundaryString, replacementString);
    fs.writeFileSync('src/app/(protected)/input/page.tsx', c);
    console.log("Successfully restored missing TableCells for Peak, Normal, and Offpeak.");
} else {
    console.log("Boundary string not found, or cells already exist.");
}
