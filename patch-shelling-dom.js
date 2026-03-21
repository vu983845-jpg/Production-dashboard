const fs = require('fs');
let c = fs.readFileSync('src/app/(protected)/input/page.tsx', 'utf8');

c = c.replace(/\{format\(parseISO\(shellingMonthlyEnergyData\[index \+ 1\]\.work_date\), "d"\)\}: \{prevRowElec\}/g, "Trừ từ trước: {prevRowElec}");
c = c.replace(/Từ mùng Trừ từ/g, 'Trừ từ');

const oldShellChange = `                                                const handleMeterChange = (val: number | undefined) => {
                                                    const newData = [...shellingMonthlyEnergyData];
                                                    newData[index].electricity_meter_reading = val;
                                                    for (let i = 0; i < newData.length - 1; i++) {
                                                        const meterToday = newData[i].electricity_meter_reading;
                                                        const meterTomorrow = newData[i + 1].electricity_meter_reading;
                                                        if (meterToday != null && meterTomorrow != null) {
                                                            newData[i].electricity_kwh = Math.max(0, meterTomorrow - meterToday);
                                                        }
                                                    }
                                                    setShellingMonthlyEnergyData(newData);
                                                };`;

const newShellChange = `                                                const handleMeterChange = (val: number | undefined) => {
                                                    const newData = [...shellingMonthlyEnergyData];
                                                    newData[index].electricity_meter_reading = val;
                                                    for (let i = 0; i < newData.length; i++) {
                                                        const meterToday = newData[i].electricity_meter_reading;
                                                        const meterYesterday = i === 0 ? prevMonthLastMeter?.elec : newData[i - 1]?.electricity_meter_reading;
                                                        if (meterToday != null && meterYesterday != null) {
                                                            newData[i].electricity_kwh = Math.max(0, meterToday - meterYesterday);
                                                        }
                                                    }
                                                    setShellingMonthlyEnergyData(newData);
                                                };`;

if (c.includes(oldShellChange)) {
    c = c.replace(oldShellChange, newShellChange);
    console.log("Shelling loop reversed successfully.");
} else {
    // regex fallback
    const looser = /const handleMeterChange = \(val: number \| undefined\) => \{[\s\S]*?setShellingMonthlyEnergyData\(newData\);\r?\n\s*\};/;
    if (c.match(looser)) {
        c = c.replace(looser, newShellChange);
        console.log("Shelling loop reversed via regex.");
    } else {
        console.log("Could not find shelling change logic!");
    }
}

fs.writeFileSync('src/app/(protected)/input/page.tsx', c);
