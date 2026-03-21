const fs = require('fs');
let c = fs.readFileSync('src/app/(protected)/input/page.tsx', 'utf8');

const helperFunc = `
const recalcEnergyData = (data: MonthlyEnergyRecord[]) => {
    for (let i = 0; i < data.length - 1; i++) {
        const today = data[i];
        const tomorrow = data[i + 1];

        // Total
        if (today.electricity_meter_reading != null && tomorrow.electricity_meter_reading != null) {
            today.electricity_kwh = Math.round(Math.max(0, tomorrow.electricity_meter_reading - today.electricity_meter_reading) * 100) / 100;
        }

        // Peak
        if (today.meter_peak != null && tomorrow.meter_peak != null) {
            today.electricity_peak_kwh = Math.round(Math.max(0, tomorrow.meter_peak - today.meter_peak) * 100) / 100;
        }

        // Normal
        if (today.meter_normal != null && tomorrow.meter_normal != null) {
            today.electricity_normal_kwh = Math.round(Math.max(0, tomorrow.meter_normal - today.meter_normal) * 100) / 100;
        }

        // Offpeak
        if (today.meter_offpeak != null && tomorrow.meter_offpeak != null) {
            today.electricity_offpeak_kwh = Math.round(Math.max(0, tomorrow.meter_offpeak - today.meter_offpeak) * 100) / 100;
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

if (!c.includes('recalcEnergyData')) {
    c = c.replace('import { Button } from "@/components/ui/button"', helperFunc + '\\nimport { Button } from "@/components/ui/button"');
}

// Write the RegExp securely:
function fixField(f) {
    const rx = new RegExp('newData\\\\[index\\\\]\\\\.' + f + ' = val;[\\\\s\\\\S]*?setMonthlyEnergyData\\\\(newData\\\\);', 'g');
    const rv = 'newData[index].' + f + ' = val;\\n                                                                    setMonthlyEnergyData(recalcEnergyData(newData));';
    c = c.replace(rx, rv);
}

fixField('meter_peak');
fixField('meter_normal');
fixField('meter_offpeak');
fixField('electricity_meter_reading');

fs.writeFileSync('src/app/(protected)/input/page.tsx', c);
console.log('RegExp Replacements applied.');
