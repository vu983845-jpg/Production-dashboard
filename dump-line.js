const fs = require('fs');
let c = fs.readFileSync('src/app/(protected)/input/page.tsx', 'utf8');
const lines = c.split('\n');
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('nextRowElec')) {
        console.log(`Line ${i + 1}: ${lines[i].trim()}`);
    }
}
