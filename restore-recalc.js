const fs = require('fs');
let c = fs.readFileSync('src/app/(protected)/input/page.tsx', 'utf8');

// First, check if recalcEnergyData exists
if (!c.includes('const recalcEnergyData =')) {
    const helperFn = `
const recalcEnergyData = (data: MonthlyEnergyRecord[], prevMonth: any) => {
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

        // If sub-meters exist, ensure Total matches sum of Peak + Normal + Offpeak
        if (today.electricity_peak_kwh != null || today.electricity_normal_kwh != null || today.electricity_offpeak_kwh != null) {
            today.electricity_kwh = (today.electricity_peak_kwh || 0) + (today.electricity_normal_kwh || 0) + (today.electricity_offpeak_kwh || 0);
        }

        // Water
        if (today.water_meter_reading != null && yesterday.water_meter_reading != null) {
            today.water_m3 = Math.max(0, today.water_meter_reading - yesterday.water_meter_reading);
        }
    }
    return data;
};
`;
    // Insert it before export default function
    c = c.replace(/export default function InputPage\(\)/, helperFn + '\nexport default function InputPage()');
    fs.writeFileSync('src/app/(protected)/input/page.tsx', c);
    console.log('Restored recalcEnergyData.');
} else {
    console.log('recalcEnergyData ALREADY EXISTS?! Wait, if it exists, why did it crash?');
}
