const fs = require('fs');
const path = 'C:/Users/Cashew/.gemini/PPE/factory-dashboard/src/app/(protected)/dashboard/page.tsx';
let content = fs.readFileSync(path, 'utf8');

const tButtonRegex = /<div className="flex items-center gap-1 mb-1">\s*<button onClick=\{\(\) => setShellingSubView\('production'\)\}/g;

const match = tButtonRegex.exec(content);
if(match) {
    const rawBlock = match[0];
    const newBlock = `{deptCode === 'SHELL' && (
                            <div className="flex items-center gap-1 mb-1">
                                <button onClick={() => setShellingSubView('production')}`;
    content = content.replace(rawBlock, newBlock);
}

// And close the bracket after the buttons
const closeRegex = /\{language === 'vi' \? '⚡ Công suất' : '⚡ Capacity'\}\s*<\/button>\s*<\/div>/g;
const closeMatch = closeRegex.exec(content);
if (closeMatch) {
    const rawClose = closeMatch[0];
    const newClose = `${rawClose}\n                        )}`;
    content = content.replace(rawClose, newClose);
}

fs.writeFileSync(path, content);
console.log('Fixed toggle buttons visibility on lines view');
