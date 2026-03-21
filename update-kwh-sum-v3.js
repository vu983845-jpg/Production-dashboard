const fs = require('fs');

let content = fs.readFileSync('src/app/(protected)/input/page.tsx', 'utf8');

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
    content = content.replace('import { Button } from "@/components/ui/button"', helperFunc + '\\nimport { Button } from "@/components/ui/button"');
}

const replaceOldLogic = (fieldMeter) => {
    const rx = new RegExp(\`newData\\[index\\]\\.\${fieldMeter} = val;[\\\\s\\\\S]*?setMonthlyEnergyData\\(newData\\);\\s*\\}\`, "g");
    const replacement = \`newData[index].\${fieldMeter} = val;
                                                                    setMonthlyEnergyData(recalcEnergyData(newData));
                                                                }\`;
    content = content.replace(rx, replacement);
};

// Replace Total meter logic
const rxTotal = new RegExp(\`newData\\[index\\]\\.electricity_meter_reading = val;[\\\\s\\\\S]*?setMonthlyEnergyData\\(newData\\);\\s*\\}\`, "g");
const rpTotal = \`newData[index].electricity_meter_reading = val;
                                                                    setMonthlyEnergyData(recalcEnergyData(newData));
                                                                }\`;
content = content.replace(rxTotal, rpTotal);

replaceOldLogic('meter_peak');
replaceOldLogic('meter_normal');
replaceOldLogic('meter_offpeak');

fs.writeFileSync('src/app/(protected)/input/page.tsx', content);
console.log("Regex replacements finished.");
