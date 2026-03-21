const fs = require('fs');
let c = fs.readFileSync('src/app/(protected)/input/page.tsx', 'utf8');

const match = c.match(/const recalcEnergyData = [\s\S]*?\};/);
if (match) {
    console.log("MATCH FOUND:\n" + match[0].substring(0, 500) + '...');
} else {
    console.log("NO MATCH");
}
