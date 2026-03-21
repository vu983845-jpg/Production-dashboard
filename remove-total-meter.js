const fs = require('fs');
let c = fs.readFileSync('src/app/(protected)/input/page.tsx', 'utf8');

// 1. Remove the "Chi so Tong" TableHead column
c = c.replace(
    `                                                <TableHead className="text-center bg-amber-50/50 border-r w-[120px]">Chỉ số Tổng</TableHead>\r\n`,
    ``
);

// 2. Remove the colspan from "Điện năng" header (was 6, now 5 since we removed 1 column)
c = c.replace(
    `<TableHead colSpan={6} className="border-r text-center text-amber-600 bg-amber-50/50">⚡ Điện năng (kWh)</TableHead>`,
    `<TableHead colSpan={5} className="border-r text-center text-amber-600 bg-amber-50/50">⚡ Điện năng (kWh)</TableHead>`
);

// 3. Remove the entire "Chỉ số Tổng" input cell in the table body
const oldTotalCell = `                                                        {/* Dien */}\r\n                                                        <TableCell className="border-r p-1 relative">\r\n                                                            <input type="number" step="1" className="w-full text-right p-1 rounded border-gray-200 outline-none focus:ring-1 focus:ring-amber-400 bg-transparent text-sm"\r\n                                                                value={row.electricity_meter_reading !== undefined ? row.electricity_meter_reading : ''}\r\n                                                                onChange={(e) => {\r\n                                                                    const val = e.target.value === '' ? undefined : Number(e.target.value);\r\n                                                                    const newData = [...monthlyEnergyData];\nconst newData = [...monthlyEnergyData];\nnewData[index].electricity_meter_reading = val;\nsetMonthlyEnergyData(recalcEnergyData(newData, prevMonthLastMeter));\r\n                                                                }} />\r\n                                                            {prevRowElec != null && <div className="text-[9px] text-amber-600 text-center absolute bottom-0 left-0 right-0">Trừ từ trước: {prevRowElec}</div>}\r\n                                                        </TableCell>`;

// Use a more flexible approach with node.js string operations
const lines = c.split('\n');
let outputLines = [];
let i = 0;
while (i < lines.length) {
    const line = lines[i];
    // Detect the start of the "Chỉ số Tổng" input cell block
    if (line.includes('{/* Dien */}') && lines[i+1] && lines[i+1].includes('electricity_meter_reading') === false && lines[i+2] && lines[i+2].includes('electricity_meter_reading')) {
        // Skip from here until we find the closing </TableCell> for this block
        outputLines.push(line); // keep the {/* Dien */} comment
        i++; // skip the <TableCell> border-r p-1 relative line
        let depth = 0;
        while (i < lines.length) {
            if (lines[i].includes('<TableCell') && lines[i].includes('border-r p-1 relative') && !lines[i].includes('bg-amber-50/10')) {
                depth++;
                i++;
                while (i < lines.length) {
                    if (lines[i].includes('</TableCell>') && depth > 0) {
                        depth--;
                        if (depth === 0) { i++; break; }
                    }
                    i++;
                }
                break; // done skipping
            } else {
                break; // not what we expected, bail
            }
        }
        continue;
    }
    outputLines.push(line);
    i++;
}

// That approach is getting complicated. Let's just use a targeted regex find/replace
// Find the specific block and remove it
const blockStart = '                                                        {/* Dien */}';
const blockToRemove = `                                                        {/* Dien */}\r\n                                                        <TableCell className="border-r p-1 relative">\r\n                                                            <input type="number" step="1" className="w-full text-right p-1 rounded border-gray-200 outline-none focus:ring-1 focus:ring-amber-400 bg-transparent text-sm"\r\n                                                                value={row.electricity_meter_reading !== undefined ? row.electricity_meter_reading : ''}\r\n                                                                onChange={(e) => {\r\n                                                                    const val = e.target.value === '' ? undefined : Number(e.target.value);\r\n                                                                    const newData = [...monthlyEnergyData];\nnewData[index].electricity_meter_reading = val;\nsetMonthlyEnergyData(recalcEnergyData(newData, prevMonthLastMeter));\r\n                                                                }} />\r\n                                                            {prevRowElec != null && <div className="text-[9px] text-amber-600 text-center absolute bottom-0 left-0 right-0">Trừ từ trước: {prevRowElec}</div>}\r\n                                                        </TableCell>\r\n`;

const blockReplace = `                                                        {/* Dien */}\r\n`;

if (c.includes(blockToRemove)) {
    c = c.replace(blockToRemove, blockReplace);
    console.log('Removed electricity_meter_reading input cell.');
} else {
    console.log('WARN: Could not find exact block. Will try looser match.');
    // Try looser: remove the TableCell for electricity_meter_reading
    const looser = /<TableCell className="border-r p-1 relative">\s*<input[^>]*electricity_meter_reading[^>]*\/>\s*\{prevRowElec.*?<\/div>\}\s*<\/TableCell>/s;
    if (c.match(looser)) {
        c = c.replace(looser, '');
        console.log('Removed using loose regex.');
    } else {
        console.log('ERROR: Could not remove cell!');
    }
}

// 4. Update the "Tổng tiêu thụ" cell to be read-only and always computed
// Replace the editable electricity_kwh input with a read-only display showing the sum
const oldKwhCell = `                                                        <TableCell className="border-r p-1">\r\n                                                            <input type="number" step="0.01" className={cn("w-full text-right p-1 rounded font-semibold outline-none text-sm", prevRowElec != null ? "bg-amber-50" : "bg-transparent focus:ring-1 focus:ring-amber-400")}\r\n                                                                readOnly={prevRowElec != null}\r\n                                                                value={row.electricity_kwh || ''}\r\n                                                                onChange={(e) => {\r\n                                                                    const newData = [...monthlyEnergyData];\r\n                                                                    newData[index].electricity_kwh = Number(e.target.value);\r\n                                                                    setMonthlyEnergyData(newData);\r\n                                                                }} />\r\n                                                        </TableCell>`;

const newKwhCell = `                                                        <TableCell className="border-r p-1 text-right font-semibold text-amber-800 bg-amber-50/40 text-sm">\r\n                                                            {row.electricity_kwh != null ? row.electricity_kwh.toLocaleString('vi-VN', {minimumFractionDigits: 0, maximumFractionDigits: 2}) : '-'}\r\n                                                        </TableCell>`;

if (c.includes(oldKwhCell)) {
    c = c.replace(oldKwhCell, newKwhCell);
    console.log('Updated electricity_kwh cell to read-only display.');
} else {
    console.log('WARN: Could not find electricity_kwh cell to make read-only.');
}

// 5. Update recalcEnergyData to always compute electricity_kwh from the sum (remove the total-meter-reading branch)
// The function already does this via "Override total if any sub-meters..." block. 
// But we should ensure it ALWAYS sets electricity_kwh = peak + normal + offpeak if sub-meters exist
// This is already handled! The last block in recalcEnergyData sets:
//   if (p > 0 || n > 0 || o > 0 || today.meter_peak != null || ...) { electricity_kwh = p+n+o; }
// Let's make it unconditional (always set from sub-meters if they exist):
c = c.replace(
    `        if (p > 0 || n > 0 || o > 0 || today.meter_peak != null || today.meter_normal != null || today.meter_offpeak != null) {\n            today.electricity_kwh = Math.max(0, p + n + o);\n        }`,
    `        if (today.meter_peak != null || today.meter_normal != null || today.meter_offpeak != null) {\n            today.electricity_kwh = Math.round((p + n + o) * 100) / 100;\n        }`
);

fs.writeFileSync('src/app/(protected)/input/page.tsx', c);
console.log('Done.');
