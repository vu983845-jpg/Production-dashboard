const fs = require('fs');

let content = fs.readFileSync('src/app/(protected)/input/page.tsx', 'utf8');

// 1. Update the Main TableHeader Colspan
content = content.replace(
    '<TableHead colSpan={3} className="border-r text-center text-amber-600 bg-amber-50/50">⚡ Điện năng (kWh)</TableHead>',
    '<TableHead colSpan={6} className="border-r text-center text-amber-600 bg-amber-50/50">⚡ Điện năng (kWh)</TableHead>'
);

// 2. Update the Sub-TableHeaders
const oldHeaders = `                                                <TableHead className="text-center bg-amber-50/50 border-r w-[120px]">Chỉ số đầu ngày</TableHead>\r
                                                <TableHead className="text-center bg-amber-50/50 border-r w-[100px]">Tiêu thụ</TableHead>\r
                                                <TableHead className="text-center bg-amber-50/50 border-r w-[80px]">Target</TableHead>`;

const newHeaders = `                                                <TableHead className="text-center bg-amber-50/50 border-r w-[120px]">Chỉ số đ.ngày</TableHead>\r
                                                <TableHead className="text-center bg-amber-50/50 border-r w-[90px]">Cao điểm</TableHead>\r
                                                <TableHead className="text-center bg-amber-50/50 border-r w-[90px]">Bình thường</TableHead>\r
                                                <TableHead className="text-center bg-amber-50/50 border-r w-[90px]">Thấp điểm</TableHead>\r
                                                <TableHead className="text-center bg-amber-50/50 border-r w-[100px]">Tổng tiêu thụ</TableHead>\r
                                                <TableHead className="text-center bg-amber-50/50 border-r w-[80px]">Target</TableHead>`;

content = content.replace(oldHeaders, newHeaders);

// 3. Inject the 3 new input cells for Cao điểm, Bình thường, Thấp điểm before Tổng Tiêu thụ.
// Let's find where the electricity_meter_reading cell ends.
const cellEnd = `                                                                }} />\r
                                                        </TableCell>\r
                                                        <TableCell className="border-r p-1 bg-amber-50/30">\r
                                                            <input type="number" step="0.01" className="w-full text-right p-1 rounded border-gray-200 outline-none focus:ring-1 focus:ring-amber-400 bg-transparent text-sm"\r
                                                                value={row.electricity_kwh || ''}\r
                                                                onChange={(e) => {\r
                                                                    const newData = [...monthlyEnergyData];\r
                                                                    newData[index].electricity_kwh = Number(e.target.value);\r
                                                                    setMonthlyEnergyData(newData);\r
                                                                }} />\r
                                                        </TableCell>`;

// We will insert the 3 new cells right between these. Wait, the first </TableCell> closes the electricity_meter_reading cell!
const newCells = `                                                                }} />\r
                                                        </TableCell>\r
                                                        <TableCell className="border-r p-1 bg-amber-50/30">\r
                                                            <input type="number" step="0.01" className="w-full text-right p-1 rounded border-gray-200 outline-none focus:ring-1 focus:ring-amber-400 bg-transparent text-sm"\r
                                                                value={row.electricity_peak_kwh || ''}\r
                                                                onChange={(e) => {\r
                                                                    const newData = [...monthlyEnergyData];\r
                                                                    newData[index].electricity_peak_kwh = Number(e.target.value);\r
                                                                    setMonthlyEnergyData(newData);\r
                                                                }} />\r
                                                        </TableCell>\r
                                                        <TableCell className="border-r p-1 bg-amber-50/30">\r
                                                            <input type="number" step="0.01" className="w-full text-right p-1 rounded border-gray-200 outline-none focus:ring-1 focus:ring-amber-400 bg-transparent text-sm"\r
                                                                value={row.electricity_normal_kwh || ''}\r
                                                                onChange={(e) => {\r
                                                                    const newData = [...monthlyEnergyData];\r
                                                                    newData[index].electricity_normal_kwh = Number(e.target.value);\r
                                                                    setMonthlyEnergyData(newData);\r
                                                                }} />\r
                                                        </TableCell>\r
                                                        <TableCell className="border-r p-1 bg-amber-50/30">\r
                                                            <input type="number" step="0.01" className="w-full text-right p-1 rounded border-gray-200 outline-none focus:ring-1 focus:ring-amber-400 bg-transparent text-sm"\r
                                                                value={row.electricity_offpeak_kwh || ''}\r
                                                                onChange={(e) => {\r
                                                                    const newData = [...monthlyEnergyData];\r
                                                                    newData[index].electricity_offpeak_kwh = Number(e.target.value);\r
                                                                    setMonthlyEnergyData(newData);\r
                                                                }} />\r
                                                        </TableCell>\r
                                                        <TableCell className="border-r p-1 bg-amber-50/30">\r
                                                            <input type="number" step="0.01" className="w-full text-right p-1 rounded border-gray-200 outline-none focus:ring-1 focus:ring-amber-400 bg-transparent text-sm"\r
                                                                value={row.electricity_kwh || ''}\r
                                                                onChange={(e) => {\r
                                                                    const newData = [...monthlyEnergyData];\r
                                                                    newData[index].electricity_kwh = Number(e.target.value);\r
                                                                    setMonthlyEnergyData(newData);\r
                                                                }} />\r
                                                        </TableCell>`;

content = content.replace(cellEnd, newCells);

if (content.includes('electricity_peak_kwh') && content.includes('Cao điểm')) {
    fs.writeFileSync('src/app/(protected)/input/page.tsx', content);
    console.log("Successfully updated UI headers and cells.");
} else {
    console.log("Failed to match old string blocks. No changes saved.");
}
