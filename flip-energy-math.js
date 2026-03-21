const fs = require('fs');
let c = fs.readFileSync('src/app/(protected)/input/page.tsx', 'utf8');

// 1. Update the prevMonth state to hold all meters
const oldPrevStateStr = `const [prevMonthLastMeter, setPrevMonthLastMeter] = useState<{ elec: number | null, water: number | null }>({ elec: null, water: null })`;
const newPrevStateStr = `const [prevMonthLastMeter, setPrevMonthLastMeter] = useState<any>({ elec: null, water: null, peak: null, normal: null, offpeak: null })`;
c = c.replace(oldPrevStateStr, newPrevStateStr);

// 2. Update fetchEnergy to query all needed meters from prevMonth
const oldFetchPrev = `.select('electricity_meter_reading, water_meter_reading')`;
const newFetchPrev = `.select('electricity_meter_reading, water_meter_reading, meter_peak, meter_normal, meter_offpeak')`;
c = c.replace(oldFetchPrev, newFetchPrev);

const oldSetPrev = `const pElec = pData?.electricity_meter_reading !== null && pData?.electricity_meter_reading !== undefined ? Number(pData.electricity_meter_reading) : null;
            const pWater = pData?.water_meter_reading !== null && pData?.water_meter_reading !== undefined ? Number(pData.water_meter_reading) : null;

            setPrevMonthLastMeter({ elec: pElec, water: pWater });`;
const newSetPrev = `const pElec = pData?.electricity_meter_reading != null ? Number(pData.electricity_meter_reading) : null;
            const pWater = pData?.water_meter_reading != null ? Number(pData.water_meter_reading) : null;
            const pPeak = pData?.meter_peak != null ? Number(pData.meter_peak) : null;
            const pNormal = pData?.meter_normal != null ? Number(pData.meter_normal) : null;
            const pOffpeak = pData?.meter_offpeak != null ? Number(pData.meter_offpeak) : null;

            setPrevMonthLastMeter({ elec: pElec, water: pWater, peak: pPeak, normal: pNormal, offpeak: pOffpeak });`;
c = c.replace(oldSetPrev, newSetPrev);

// 3. Rewrite recalcEnergyData function
const oldHelper = `const recalcEnergyData = (data: MonthlyEnergyRecord[]) => {
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
};`;

// We inject prevMonthLastMeter dynamically into recalcEnergyData by wrapping it as a state call inside the component if we can, 
// BUT recalcEnergyData is defined OUTSIDE the component (above InputPage).
// Let's modify recalcEnergyData to accept prevMonth object: \`recalcEnergyData(data, prevMonthLastMeter)\`
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
            today.electricity_kwh = Math.round(Math.max(0, today.electricity_meter_reading - yesterday.electricity_meter_reading) * 100) / 100;
        }

        // Peak
        if (today.meter_peak != null && yesterday.meter_peak != null) {
            today.electricity_peak_kwh = Math.round(Math.max(0, today.meter_peak - yesterday.meter_peak) * 100) / 100;
        }

        // Normal
        if (today.meter_normal != null && yesterday.meter_normal != null) {
            today.electricity_normal_kwh = Math.round(Math.max(0, today.meter_normal - yesterday.meter_normal) * 100) / 100;
        }

        // Offpeak
        if (today.meter_offpeak != null && yesterday.meter_offpeak != null) {
            today.electricity_offpeak_kwh = Math.round(Math.max(0, today.meter_offpeak - yesterday.meter_offpeak) * 100) / 100;
        }

        // Water (Apply same logic for consistency, as midnight captures apply everywhere)
        if (today.water_meter_reading != null && yesterday.water_meter_reading != null) {
            today.water_m3 = Math.round(Math.max(0, today.water_meter_reading - yesterday.water_meter_reading) * 100) / 100;
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
};`;

c = c.replace(oldHelper, newHelper);

// 4. Update all \`setMonthlyEnergyData(recalcEnergyData(newData));\` to bind the prevMonth argument
c = c.replace(/setMonthlyEnergyData\(recalcEnergyData\(newData\)\);/g, "setMonthlyEnergyData(recalcEnergyData(newData, prevMonthLastMeter));");

// 5. Update Water onChange to also use recalcEnergyData instead of its manual loop!
const oldWaterLoop = `                                                    } else {
                                                        newData[index].water_meter_reading = val;
                                                        for (let i = 0; i < newData.length - 1; i++) {
                                                            const meterToday = newData[i].water_meter_reading;
                                                            const meterTomorrow = newData[i + 1].water_meter_reading;
                                                            if (meterToday != null && meterTomorrow != null) {
                                                                newData[i].water_m3 = Math.max(0, meterTomorrow - meterToday);
                                                            }
                                                        }
                                                    }`;
const newWaterLoop = `                                                    } else {
                                                        newData[index].water_meter_reading = val;
                                                        recalcEnergyData(newData, prevMonthLastMeter);
                                                    }`;
c = c.replace(oldWaterLoop, newWaterLoop);

// 6. Fix "Trừ từ sau: {nextRow}" to "Trừ từ trước: {prevRow}" on the DOM outputs.
// 6a. Next Row Elec => Prev Row Elec
c = c.replace(/const nextRowElec = index < monthlyEnergyData\.length - 1 \? monthlyEnergyData\[index \+ 1\]\.electricity_meter_reading : undefined;/g, 
"const prevRowElec = index > 0 ? monthlyEnergyData[index - 1].electricity_meter_reading : prevMonthLastMeter?.elec;");
c = c.replace(/nextRowElec != null/g, "prevRowElec != null");
c = c.replace(/{nextRowElec}/g, "{prevRowElec}");

// 6b. Next Row Water => Prev Row Water
c = c.replace(/const nextRowWater = index < monthlyEnergyData\.length - 1 \? monthlyEnergyData\[index \+ 1\]\.water_meter_reading : undefined;/g, 
"const prevRowWater = index > 0 ? monthlyEnergyData[index - 1].water_meter_reading : prevMonthLastMeter?.water;");
c = c.replace(/nextRowWater != null/g, "prevRowWater != null");
c = c.replace(/{nextRowWater}/g, "{prevRowWater}");

// 6c. Labels "Trừ từ sau:"
c = c.replace(/Trừ từ sau:/g, "Trừ từ trước:");

fs.writeFileSync('src/app/(protected)/input/page.tsx', c);
console.log("TSX mathematical logic inversions complete.");
