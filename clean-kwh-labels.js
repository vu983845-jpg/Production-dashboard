const fs = require('fs');
let c = fs.readFileSync('src/app/(protected)/input/page.tsx', 'utf8');

// Remove the always-visible kWh overlay divs and clean up their parent cell styling
// Pattern: remove the absolute kWh label div line for each of the 3 sub-meters
const remove = [
    '{row.electricity_peak_kwh !== undefined && <div className="text-[10px] text-amber-600 text-center absolute bottom-0 left-0 right-0">{row.electricity_peak_kwh} kWh</div>}',
    '{row.electricity_normal_kwh !== undefined && <div className="text-[10px] text-amber-600 text-center absolute bottom-0 left-0 right-0">{row.electricity_normal_kwh} kWh</div>}',
    '{row.electricity_offpeak_kwh !== undefined && <div className="text-[10px] text-amber-600 text-center absolute bottom-0 left-0 right-0">{row.electricity_offpeak_kwh} kWh</div>}',
];
remove.forEach(r => {
    if (c.includes(r)) {
        c = c.replace(r, '');
        console.log('Removed:', r.slice(0, 60));
    } else {
        console.log('NOT FOUND:', r.slice(0, 60));
    }
});

// Remove the extra pb-4 and relative positioning from these cells
// There are 3 instances of this class on the 3 sub-meter cells
let count = 0;
c = c.replace(/className="border-r p-1 bg-amber-50\/10 relative pb-4"/g, (match) => {
    count++;
    return 'className="border-r p-1 bg-amber-50/10"';
});
console.log(`Replaced ${count} instances of pb-4 classes`);

fs.writeFileSync('src/app/(protected)/input/page.tsx', c);
console.log('Done.');
