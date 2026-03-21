const fs = require('fs');
let c = fs.readFileSync('src/app/(protected)/input/page.tsx', 'utf8');

const regexElec = /nextRowElec/g;
const regexWater = /nextRowWater/g;

console.log("Found nextRowElec:", (c.match(regexElec) || []).length);
console.log("Found nextRowWater:", (c.match(regexWater) || []).length);
