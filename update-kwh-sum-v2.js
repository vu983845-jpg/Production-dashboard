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

const replaceOldLogic = (fieldMeter, fieldKwh) => {
    const oldBlock = `                                                                    const val = e.target.value === '' ? undefined : Number(e.target.value);
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
                                                                    setMonthlyEnergyData(newData);`;
    const newBlock = `                                                                    const val = e.target.value === '' ? undefined : Number(e.target.value);
                                                                    const newData = [...monthlyEnergyData];
                                                                    newData[index].${fieldMeter} = val;
                                                                    setMonthlyEnergyData(recalcEnergyData(newData));`;
    
    // Normal string replace
    if (content.includes(oldBlock)) {
        content = content.replace(oldBlock, newBlock);
        console.log("Successfully replaced block for:", fieldMeter);
    } else {
        console.log("Could not find exact string block for:", fieldMeter);
    }
};

const oldTotalMeter = `                                                                    const val = e.target.value === '' ? undefined : Number(e.target.value);
                                                                    const newData = [...monthlyEnergyData];
                                                                    newData[index].electricity_meter_reading = val;
                                                                    for (let i = 0; i < newData.length - 1; i++) {
                                                                        const meterToday = newData[i].electricity_meter_reading;
                                                                        const meterTomorrow = newData[i + 1].electricity_meter_reading;
                                                                        if (meterToday != null && meterTomorrow != null) {
                                                                            newData[i].electricity_kwh = Math.max(0, meterTomorrow - meterToday);
                                                                        }
                                                                    }
                                                                    setMonthlyEnergyData(newData);`;

const newTotalMeter = `                                                                    const val = e.target.value === '' ? undefined : Number(e.target.value);
                                                                    const newData = [...monthlyEnergyData];
                                                                    newData[index].electricity_meter_reading = val;
                                                                    setMonthlyEnergyData(recalcEnergyData(newData));`;

if (content.includes(oldTotalMeter)) {
    content = content.replace(oldTotalMeter, newTotalMeter);
    console.log("Successfully replaced Total Meter block");
} else {
    console.log("Could not find Total Meter block");
}

replaceOldLogic('meter_peak', 'electricity_peak_kwh');
replaceOldLogic('meter_normal', 'electricity_normal_kwh');
replaceOldLogic('meter_offpeak', 'electricity_offpeak_kwh');

fs.writeFileSync('src/app/(protected)/input/page.tsx', content);
console.log("Updated UI with recalculation loop");
