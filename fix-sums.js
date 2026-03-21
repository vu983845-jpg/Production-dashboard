const fs = require('fs');
let c = fs.readFileSync('src/app/(protected)/input/page.tsx', 'utf8');

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

if (!c.includes('recalcEnergyData')) {
    c = c.replace('import { Button } from "@/components/ui/button"', helperFunc + '\\nimport { Button } from "@/components/ui/button"');
}

const fixField = (meterField, kwhField) => {
    const s1 = `newData[index].${meterField} = val;\r
                                                                    if (index < newData.length - 1) {\r
                                                                        const cToday = newData[index].${meterField};\r
                                                                        const cTomorrow = newData[index + 1].${meterField};\r
                                                                        if (cToday != null && cTomorrow != null) {\r
                                                                            newData[index].${kwhField} = Math.max(0, cTomorrow - cToday);\r
                                                                        }\r
                                                                    }\r
                                                                    if (index > 0) {\r
                                                                        const cYesterday = newData[index - 1].${meterField};\r
                                                                        const cToday = newData[index].${meterField};\r
                                                                        if (cYesterday != null && cToday != null) {\r
                                                                            newData[index - 1].${kwhField} = Math.max(0, cToday - cYesterday);\r
                                                                        }\r
                                                                    }\r
                                                                    setMonthlyEnergyData(newData);`;
                                                                    
    const r1 = `newData[index].${meterField} = val;\r
                                                                    setMonthlyEnergyData(recalcEnergyData(newData));`;
                                                                    
    // Handle LF just in case
    const s2 = s1.replace(/\\r\\n/g, '\\n');
    const r2 = r1.replace(/\\r\\n/g, '\\n');
    
    if (c.includes(s1)) c = c.split(s1).join(r1);
    else if (c.includes(s2)) c = c.split(s2).join(r2);
    else console.log('Could not find chunk for ' + meterField);
}

fixField('meter_peak', 'electricity_peak_kwh');
fixField('meter_normal', 'electricity_normal_kwh');
fixField('meter_offpeak', 'electricity_offpeak_kwh');

// Fix Total Meter
const tm1 = `newData[index].electricity_meter_reading = val;\r
                                                                    for (let i = 0; i < newData.length - 1; i++) {\r
                                                                        const meterToday = newData[i].electricity_meter_reading;\r
                                                                        const meterTomorrow = newData[i + 1].electricity_meter_reading;\r
                                                                        if (meterToday != null && meterTomorrow != null) {\r
                                                                            newData[i].electricity_kwh = Math.max(0, meterTomorrow - meterToday);\r
                                                                        }\r
                                                                    }\r
                                                                    setMonthlyEnergyData(newData);`;
const tm2 = tm1.replace(/\\r\\n/g, '\\n');

const tmR1 = `newData[index].electricity_meter_reading = val;\r
                                                                    setMonthlyEnergyData(recalcEnergyData(newData));`;
const tmR2 = tmR1.replace(/\\r\\n/g, '\\n');

if (c.includes(tm1)) c = c.split(tm1).join(tmR1);
else if (c.includes(tm2)) c = c.split(tm2).join(tmR2);
else console.log('Could not find chunk for total meter');

fs.writeFileSync('src/app/(protected)/input/page.tsx', c);
console.log('done');
