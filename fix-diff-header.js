const fs = require('fs');
const filePath = 'src/components/bao-com/MealAiChat.tsx';
const lines = fs.readFileSync(filePath, 'utf8').split('\n');
// Insert Chay OT header after the Chay th (line index 465 = line 466)
lines.splice(466, 0, '                                                    <th className="px-3 py-2 text-center">Chay OT</th>');
fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
console.log('Done. Lines around insertion:');
lines.slice(463, 470).forEach((l, i) => console.log(464 + i, l));
