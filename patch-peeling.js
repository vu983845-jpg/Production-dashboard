const fs = require('fs');
const path = require('path');

const filePath = path.join('src', 'app', '(protected)', 'input', 'page.tsx');
let c = fs.readFileSync(filePath, 'utf8');

// Helper: show context safely
function showCtx(c, idx) {
    if (idx < 0) return 'NOT FOUND';
    return JSON.stringify(c.substring(idx, idx+300));
}

// 1. Already done by previous run:
// type PeelLineEntry includes pass2_ton

// 2. Fix fetch - the file uses \r\r\n so we need to match that
const idx2 = c.indexOf('actual_ton: Number(r.actual_ton || 0),');
console.log('Fetch at idx:', idx2);
if (idx2 > -1) {
    const ctx = c.substring(idx2, idx2+200);
    console.log('Ctx:', JSON.stringify(ctx));
    // Check if pass2_ton already there
    if (!c.includes('pass2_ton: Number(r.pass2_ton || 0),')) {
        // Find the actual replacement - need to handle \r\r\n
        const toFind = 'actual_ton: Number(r.actual_ton || 0),\r\r\n\r\r\n                        broken_pct:';
        const toReplace = 'actual_ton: Number(r.actual_ton || 0),\r\r\n                        pass2_ton: Number(r.pass2_ton || 0),\r\r\n                        broken_pct:';
        if (c.includes(toFind)) {
            c = c.replace(toFind, toReplace);
            console.log('Fixed fetch');
        } else {
            console.error('Fetch pattern not found exactly');
        }
    } else {
        console.log('Fetch already has pass2_ton');
    }
}

// 3. Fix save - add pass2_ton when building payload
const idx3 = c.indexOf('actual_ton: d.actual_ton,');
console.log('Save at idx:', idx3);
if (idx3 > -1) {
    const ctx = c.substring(idx3, idx3+200);
    console.log('Save ctx:', JSON.stringify(ctx));
    if (!c.includes('pass2_ton: d.pass2_ton,')) {
        // Try multiple patterns
        const patterns = [
            ['actual_ton: d.actual_ton,\r\r\n\r\r\n\r\r\n                broken_pct:', 'actual_ton: d.actual_ton,\r\r\n                pass2_ton: d.pass2_ton,\r\r\n                broken_pct:'],
            ['actual_ton: d.actual_ton,\r\n\r\n                broken_pct:', 'actual_ton: d.actual_ton,\r\n                pass2_ton: d.pass2_ton,\r\n                broken_pct:'],
        ];
        let fixed = false;
        for (const [find, replace] of patterns) {
            if (c.includes(find)) {
                c = c.replace(find, replace);
                console.log('Fixed save with pattern');
                fixed = true;
                break;
            }
        }
        if (!fixed) {
            console.log('Save ctx full:', JSON.stringify(c.substring(idx3-20, idx3+300)));
        }
    } else {
        console.log('Save already has pass2_ton');
    }
}

// 4. Fix initPeelLineObj - should already be done but verify
if (c.includes("'Ca 1': { actual_ton: 0, pass2_ton: 0")) {
    console.log('init already patched');
} else {
    console.log('init NOT patched yet');
}

fs.writeFileSync(filePath, c, 'utf8');
console.log('Done');
