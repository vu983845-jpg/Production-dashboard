const fs = require('fs');
let c = fs.readFileSync('src/app/(protected)/input/page.tsx', 'utf8');

// 1. Fix the Shelling Table nextRowElec mapping
c = c.replace(/const nextRowElec = index < shellingMonthlyEnergyData\.length - 1 \? shellingMonthlyEnergyData\[index \+ 1\]\.electricity_meter_reading : undefined;/g,
"const prevRowElec = index > 0 ? shellingMonthlyEnergyData[index - 1].electricity_meter_reading : prevMonthLastMeter?.elec;");

// 2. Fix recalcEnergyData mathematical flip (subtracting yesterday from today instead of today from tomorrow)
const oldHelper = `const recalcEnergyData = (data: MonthlyEnergyRecord[]) => {
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
            today.electricity_kwh = Math.max(0, p + n + o);
        }
    }
    return data;
};`;

const newHelper = `const recalcEnergyData = (data: MonthlyEnergyRecord[], prevMonth: any) => {
    for (let i = 0; i < data.length; i++) {
        const today = data[i];
        const yesterday = i === 0 ? 
            { 
                electricity_meter_reading: prevMonth?.elec, 
                water_meter_reading: prevMonth?.water,
                meter_peak: prevMonth?.peak,
                meter_normal: prevMonth?.normal,
                meter_offpeak: prevMonth?.offpeak
            } 
            : data[i - 1];

        // Total
        if (today.electricity_meter_reading != null && yesterday.electricity_meter_reading != null) {
            today.electricity_kwh = Math.max(0, today.electricity_meter_reading - yesterday.electricity_meter_reading);
        }

        // Peak
        if (today.meter_peak != null && yesterday.meter_peak != null) {
            today.electricity_peak_kwh = Math.max(0, today.meter_peak - yesterday.meter_peak);
        }

        // Normal
        if (today.meter_normal != null && yesterday.meter_normal != null) {
            today.electricity_normal_kwh = Math.max(0, today.meter_normal - yesterday.meter_normal);
        }

        // Offpeak
        if (today.meter_offpeak != null && yesterday.meter_offpeak != null) {
            today.electricity_offpeak_kwh = Math.max(0, today.meter_offpeak - yesterday.meter_offpeak);
        }

        // Water
        if (today.water_meter_reading != null && yesterday.water_meter_reading != null) {
            today.water_m3 = Math.max(0, today.water_meter_reading - yesterday.water_meter_reading);
        }

        // Override total if any sub-meters are calculated
        const p = today.electricity_peak_kwh || 0;
        const n = today.electricity_normal_kwh || 0;
        const o = today.electricity_offpeak_kwh || 0;
        
        if (p > 0 || n > 0 || o > 0 || today.meter_peak != null || today.meter_normal != null || today.meter_offpeak != null) {
            today.electricity_kwh = Math.max(0, p + n + o);
        }
    }
    return data;
};`;

if (c.includes(oldHelper)) {
    c = c.replace(oldHelper, newHelper);
    console.log("recalcEnergyData mathematically inverted.");
} else {
    // try a more loose regex if whitespace differs
    const looserRegex = /const recalcEnergyData = \(data: MonthlyEnergyRecord\[\]\) => \{[\s\S]*?return data;\r?\n\s*\};/;
    if (c.match(looserRegex)) {
        c = c.replace(looserRegex, newHelper);
        console.log("recalcEnergyData mathematically inverted (via regex).");
    } else {
        console.log("Could NOT find old recalcEnergyData to replace!");
    }
}

// 3. Similarly for the Shelling table, its calculation also needs to be yesterday not tomorrow!
const oldShellCalc = `                                                    for (let i = 0; i < newData.length - 1; i++) {
                                                        const meterToday = newData[i].electricity_meter_reading;
                                                        const meterTomorrow = newData[i + 1].electricity_meter_reading;
                                                        if (meterToday != null && meterTomorrow != null) {
                                                            newData[i].electricity_kwh = Math.max(0, meterTomorrow - meterToday);
                                                        }
                                                    }`;
const newShellCalc = `                                                    for (let i = 0; i < newData.length; i++) {
                                                        const meterToday = newData[i].electricity_meter_reading;
                                                        const meterYesterday = i === 0 ? prevMonthLastMeter?.elec : newData[i - 1]?.electricity_meter_reading;
                                                        if (meterToday != null && meterYesterday != null) {
                                                            newData[i].electricity_kwh = Math.max(0, meterToday - meterYesterday);
                                                        }
                                                    }`;
if (c.includes(oldShellCalc)) {
    c = c.replace(oldShellCalc, newShellCalc);
    console.log("Shelling calc inverted.");
} else {
    console.log("Could NOT find shelling calc to replace!");
}

fs.writeFileSync('src/app/(protected)/input/page.tsx', c);
