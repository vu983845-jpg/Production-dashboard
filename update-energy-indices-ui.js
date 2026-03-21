const fs = require('fs');

let content = fs.readFileSync('src/app/(protected)/input/page.tsx', 'utf8');

// 1. Update MonthlyEnergyRecord to map the meter indices
// Let's replace the previous patch
content = content.replace(
    /electricity_peak_kwh\?: number;\s*electricity_normal_kwh\?: number;\s*electricity_offpeak_kwh\?: number;/,
    `electricity_peak_kwh?: number;
    electricity_normal_kwh?: number;
    electricity_offpeak_kwh?: number;
    meter_peak?: number;
    meter_normal?: number;
    meter_offpeak?: number;`
);

// 2. Add them to fetchEnergy parsing
content = content.replace(
    /electricity_peak_kwh: existing\?\.electricity_peak_kwh(.*),\s*electricity_normal_kwh: existing\?\.electricity_normal_kwh(.*),\s*electricity_offpeak_kwh: existing\?\.electricity_offpeak_kwh(.*),/,
    `electricity_peak_kwh: existing?.electricity_peak_kwh !== null && existing?.electricity_peak_kwh !== undefined ? Number(existing?.electricity_peak_kwh) : undefined,
                    electricity_normal_kwh: existing?.electricity_normal_kwh !== null && existing?.electricity_normal_kwh !== undefined ? Number(existing?.electricity_normal_kwh) : undefined,
                    electricity_offpeak_kwh: existing?.electricity_offpeak_kwh !== null && existing?.electricity_offpeak_kwh !== undefined ? Number(existing?.electricity_offpeak_kwh) : undefined,
                    meter_peak: existing?.meter_peak !== null && existing?.meter_peak !== undefined ? Number(existing?.meter_peak) : undefined,
                    meter_normal: existing?.meter_normal !== null && existing?.meter_normal !== undefined ? Number(existing?.meter_normal) : undefined,
                    meter_offpeak: existing?.meter_offpeak !== null && existing?.meter_offpeak !== undefined ? Number(existing?.meter_offpeak) : undefined,`
);

// 3. Add to saveEnergy payload
content = content.replace(
    /electricity_peak_kwh: record\.electricity_peak_kwh \?\? null,\s*electricity_normal_kwh: record\.electricity_normal_kwh \?\? null,\s*electricity_offpeak_kwh: record\.electricity_offpeak_kwh \?\? null,/,
    `electricity_peak_kwh: record.electricity_peak_kwh ?? null,
            electricity_normal_kwh: record.electricity_normal_kwh ?? null,
            electricity_offpeak_kwh: record.electricity_offpeak_kwh ?? null,
            meter_peak: record.meter_peak ?? null,
            meter_normal: record.meter_normal ?? null,
            meter_offpeak: record.meter_offpeak ?? null,`
);

// 4. In UI, rename table headers to clarify these are INDICES
content = content.replace(
    '<TableHead className="text-center bg-amber-50/50 border-r w-[90px]">Cao điểm</TableHead>',
    '<TableHead className="text-center bg-amber-50/50 border-r w-[90px]">C.số Cao</TableHead>'
);
content = content.replace(
    '<TableHead className="text-center bg-amber-50/50 border-r w-[90px]">Bình thường</TableHead>',
    '<TableHead className="text-center bg-amber-50/50 border-r w-[90px]">C.số B.Thường</TableHead>'
);
content = content.replace(
    '<TableHead className="text-center bg-amber-50/50 border-r w-[90px]">Thấp điểm</TableHead>',
    '<TableHead className="text-center bg-amber-50/50 border-r w-[90px]">C.số Thấp</TableHead>'
);
content = content.replace(
    '<TableHead className="text-center bg-amber-50/50 border-r w-[120px]">Chỉ số đ.ngày</TableHead>',
    '<TableHead className="text-center bg-amber-50/50 border-r w-[120px]">Chỉ số Tổng</TableHead>'
);

// 5. Rewrite the 3 new table cells logic to bind to `meter_x` and display the calculated `electricity_x_kwh`
const cellPeakRegex = /<TableCell className="border-r p-1 bg-amber-50\/30">\s*<input type="number" step="0\.01" className="w-full text-right p-1 rounded border-gray-200 outline-none focus:ring-1 focus:ring-amber-400 bg-transparent text-sm"\s*value=\{row\.electricity_peak_kwh \|\| ''\}\s*onChange=\{\(e\) => \{\s*const newData = \[\.\.\.monthlyEnergyData\];\s*newData\[index\]\.electricity_peak_kwh = Number\(e\.target\.value\);\s*setMonthlyEnergyData\(newData\);\s*\}\} \/>\s*<\/TableCell>/s;
const cellNormalRegex = /<TableCell className="border-r p-1 bg-amber-50\/30">\s*<input type="number" step="0\.01" className="w-full text-right p-1 rounded border-gray-200 outline-none focus:ring-1 focus:ring-amber-400 bg-transparent text-sm"\s*value=\{row\.electricity_normal_kwh \|\| ''\}\s*onChange=\{\(e\) => \{\s*const newData = \[\.\.\.monthlyEnergyData\];\s*newData\[index\]\.electricity_normal_kwh = Number\(e\.target\.value\);\s*setMonthlyEnergyData\(newData\);\s*\}\} \/>\s*<\/TableCell>/s;
const cellOffpeakRegex = /<TableCell className="border-r p-1 bg-amber-50\/30">\s*<input type="number" step="0\.01" className="w-full text-right p-1 rounded border-gray-200 outline-none focus:ring-1 focus:ring-amber-400 bg-transparent text-sm"\s*value=\{row\.electricity_offpeak_kwh \|\| ''\}\s*onChange=\{\(e\) => \{\s*const newData = \[\.\.\.monthlyEnergyData\];\s*newData\[index\]\.electricity_offpeak_kwh = Number\(e\.target\.value\);\s*setMonthlyEnergyData\(newData\);\s*\}\} \/>\s*<\/TableCell>/s;

const recalcScript = (fieldMeter, fieldKwh) => `
                                                                    const val = e.target.value === '' ? undefined : Number(e.target.value);
                                                                    const newData = [...monthlyEnergyData];
                                                                    newData[index].${fieldMeter} = val;
                                                                    if (index < newData.length - 1) {
                                                                        const cToday = newData[index].${fieldMeter};
                                                                        const cTomorrow = newData[index + 1].${fieldMeter};
                                                                        if (cToday != null && cTomorrow != null) {
                                                                            newData[index].${fieldKwh} = Math.max(0, cTomorrow - cToday);
                                                                        }
                                                                    }
                                                                    if (index > 0) {
                                                                        const cYesterday = newData[index - 1].${fieldMeter};
                                                                        const cToday = newData[index].${fieldMeter};
                                                                        if (cYesterday != null && cToday != null) {
                                                                            newData[index - 1].${fieldKwh} = Math.max(0, cToday - cYesterday);
                                                                        }
                                                                    }
                                                                    setMonthlyEnergyData(newData);
`;

const replaceCell = (regex, fieldMeter, fieldKwh) => {
    content = content.replace(regex, `
                                                        <TableCell className="border-r p-1 bg-amber-50/10 relative pb-4">
                                                            <input type="number" step="0.01" className="w-full text-right p-1 rounded border-gray-200 outline-none focus:ring-1 focus:ring-amber-400 bg-transparent text-sm font-semibold"
                                                                value={row.${fieldMeter} !== undefined ? row.${fieldMeter} : ''}
                                                                onChange={(e) => {${recalcScript(fieldMeter, fieldKwh)}
                                                                }} />
                                                            {row.${fieldKwh} !== undefined && <div className="text-[10px] text-amber-600 text-center absolute bottom-0 left-0 right-0">{row.${fieldKwh}} kWh</div>}
                                                        </TableCell>`);
};

replaceCell(cellPeakRegex, 'meter_peak', 'electricity_peak_kwh');
replaceCell(cellNormalRegex, 'meter_normal', 'electricity_normal_kwh');
replaceCell(cellOffpeakRegex, 'meter_offpeak', 'electricity_offpeak_kwh');

// 6. Make sure Total Meter calculation also preserves sum check if they want to. Actually, they just said "tổng tiêu thụ bằng 3 cái đó cộng lại".
// If the user inputs the 3, and wants the Total Consumption to be their sum... But what if they also input the Total Index?
// If they input the Total Index, it should calculate the Total Consumption directly.
// We'll leave the Total Index as is. They can verify if Total Consumption = Peak+Norm+Offpeak visually.

fs.writeFileSync('src/app/(protected)/input/page.tsx', content);
console.log("Updated UI with index inputs and auto-calculations");
