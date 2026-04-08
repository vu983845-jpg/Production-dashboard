const fs = require('fs');
const path = 'src/app/(protected)/input/page.tsx';
let content = fs.readFileSync(path, 'utf8');

const targetStr = "departments.find(d => d.id === selectedDept)?.code === 'PEEL_MC' ? ' hidden' : ''";
const newStr = "['PEEL_MC', 'CS'].includes(departments.find(d => d.id === selectedDept)?.code || '') ? ' hidden' : ''";

if (content.includes(targetStr)) {
    content = content.replace(targetStr, newStr);
    fs.writeFileSync(path, content, 'utf8');
    console.log("Successfully replaced the condition to hide legacy form for CS!");
} else {
    console.log("Could not find exact string. Checking alternative spacing...");
    // maybe spacing varies
    const targetRegex = /departments\.find\(d => d\.id === selectedDept\)\?\.code === 'PEEL_MC'\s*\?\s*' hidden'\s*:\s*''/;
    if (targetRegex.test(content)) {
        content = content.replace(targetRegex, newStr);
        fs.writeFileSync(path, content, 'utf8');
        console.log("Replaced via regex!");
    } else {
        console.log("Still not found!");
    }
}
