const fs = require('fs');
const file = 'src/app/(protected)/dashboard/page.tsx';
let lines = fs.readFileSync(file, 'utf8').split('\n');

for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('bg-white/70 backdrop-blur-xl') && lines[i].trim() === '<Card key={id} className={`bg-white/70 backdrop-blur-xl') {
        lines[i] = "            <Card key={id} className={`bg-white/70 backdrop-blur-xl border border-white/50 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 relative overflow-hidden flex flex-col justify-start h-full ring-1 ring-black/5 ${isTotal ? 'ring-primary/40 shadow-primary/10' : ''}`}>";
    }
}
fs.writeFileSync(file, lines.join('\n'));
console.log('fixed');
