const fs = require('fs');

let content = fs.readFileSync('src/app/(protected)/input/page.tsx', 'utf8');

// 1. Insert the helper function right before `export default function InputPage()` or inside it.
// Let's insert it right after the type definitions (around line 34)
const helperFunc = `
const recalcEnergyData = (data: MonthlyEnergyRecord[]) => {
    for (let i = 0; i < data.length - 1; i++) {
        const today = data[i];
        const tomorrow = data[i + 1];

        // Total
        if (today.electricity_meter_reading != null && tomorrow.electricity_meter_reading != null) {
            today.electricity_kwh = Math.max(0, tomorrow.electricity_meter_reading - today.electricity_meter_reading);
        }

        // Peak
        if (today.meter_peak != null && tomorrow.meter_peak != null) {
            today.electricity_peak_kwh = Math.max(0, tomorrow.meter_peak - today.meter_peak);
        }

        // Normal
        if (today.meter_normal != null && tomorrow.meter_normal != null) {
            today.electricity_normal_kwh = Math.max(0, tomorrow.meter_normal - today.meter_normal);
        }

        // Offpeak
        if (today.meter_offpeak != null && tomorrow.meter_offpeak != null) {
            today.electricity_offpeak_kwh = Math.max(0, tomorrow.meter_offpeak - today.meter_offpeak);
        }

        // Override total if any sub-meters are calculated
        const p = today.electricity_peak_kwh || 0;
        const n = today.electricity_normal_kwh || 0;
        const o = today.electricity_offpeak_kwh || 0;
        
        if (p > 0 || n > 0 || o > 0 || today.meter_peak != null || today.meter_normal != null || today.meter_offpeak != null) {
            today.electricity_kwh = Math.round((p + n + o) * 100) / 100;
        }
    }
    return data;
};
`;

if (!content.includes('recalcEnergyData')) {
    content = content.replace('import { Button } from "@/components/ui/button"', helperFunc + '\nimport { Button } from "@/components/ui/button"');
}

// 2. Replace all the onChange blocks for the 4 meters
const replaceOnChange = (field) => {
    // A bit tricky because of variable spacing.
    // We will look for: <input type="number"... value={row.FIELD ... onChange={(e) => { ... }} />
    // We can use a regex that safely replacing the onChange blocks.
    const regex = new RegExp(\`onChange=\\{\\(e\\) => \\{\\s*const val = e\\.target\\.value === '' \\? undefined : Number\\(e\\.target\\.value\\);\\s*const newData = \\[\.\.\.monthlyEnergyData\\];\\s*newData\\[index\\]\\.\${field} = val;[\\s\\S]*?setMonthlyEnergyData\\(newData\\);\\s*\\}\\}\`, 'g');
    
    // For electricity_meter_reading, it actually also has: if (meterToday != null...) which is matched by [\s\S]*?
    const replacement = \`onChange={(e) => {
                                                                    const val = e.target.value === '' ? undefined : Number(e.target.value);
                                                                    const newData = [...monthlyEnergyData];
                                                                    newData[index].\${field} = val;
                                                                    setMonthlyEnergyData(recalcEnergyData(newData));
                                                                }}\`;
    
    // Also, handle the case where val is not defined like that (maybe directly Number(e.target.value))
    // Let's just do a simpler search and replace for electricity_meter_reading:
    content = content.replace(regex, replacement);
};

// electricity_meter_reading replacement:
// Currently:
/*
                                                                onChange={(e) => {
                                                                    const val = e.target.value === '' ? undefined : Number(e.target.value);
                                                                    const newData = [...monthlyEnergyData];
                                                                    newData[index].electricity_meter_reading = val;
                                                                    for (let i = 0; i < newData.length - 1; i++) {
                                                                        const meterToday = newData[i].electricity_meter_reading;
                                                                        const meterTomorrow = newData[i + 1].electricity_meter_reading;
                                                                        if (meterToday != null && meterTomorrow != null) {
                                                                            newData[i].electricity_kwh = Math.max(0, meterTomorrow - meterToday);
                                                                        }
                                                                    }
                                                                    setMonthlyEnergyData(newData);
                                                                }}
*/
const oldTotalMeter = \`onChange={(e) => {
                                                                    const val = e.target.value === '' ? undefined : Number(e.target.value);
                                                                    const newData = [...monthlyEnergyData];
                                                                    newData[index].electricity_meter_reading = val;
                                                                    for (let i = 0; i < newData.length - 1; i++) {
                                                                        const meterToday = newData[i].electricity_meter_reading;
                                                                        const meterTomorrow = newData[i + 1].electricity_meter_reading;
                                                                        if (meterToday != null && meterTomorrow != null) {
                                                                            newData[i].electricity_kwh = Math.max(0, meterTomorrow - meterToday);
                                                                        }
                                                                    }
                                                                    setMonthlyEnergyData(newData);
                                                                }}\`;
const newTotalMeter = \`onChange={(e) => {
                                                                    const val = e.target.value === '' ? undefined : Number(e.target.value);
                                                                    const newData = [...monthlyEnergyData];
                                                                    newData[index].electricity_meter_reading = val;
                                                                    setMonthlyEnergyData(recalcEnergyData(newData));
                                                                }}\`;
content = content.replace(oldTotalMeter, newTotalMeter);

replaceOnChange('meter_peak');
replaceOnChange('meter_normal');
replaceOnChange('meter_offpeak');

fs.writeFileSync('src/app/(protected)/input/page.tsx', content);
console.log("Successfully rewrote energy calculus in TSX.");
