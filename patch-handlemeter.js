const fs = require('fs');
let c = fs.readFileSync('src/app/(protected)/input/page.tsx', 'utf8');

c = c.replace(/handleMeterChange\('electric',\s*val\);/g, 
`const newData = [...monthlyEnergyData];
newData[index].electricity_meter_reading = val;
setMonthlyEnergyData(recalcEnergyData(newData, prevMonthLastMeter));`);

c = c.replace(/handleMeterChange\('water',\s*val\);/g, 
`const newData = [...monthlyEnergyData];
newData[index].water_meter_reading = val;
setMonthlyEnergyData(recalcEnergyData(newData, prevMonthLastMeter));`);

fs.writeFileSync('src/app/(protected)/input/page.tsx', c);
console.log("handleMeterChange references replaced inline.");
