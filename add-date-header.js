const fs = require('fs');
const f = 'src/app/(protected)/input/page.tsx';
let c = fs.readFileSync(f, 'utf8');

// Add date badge to table header "Giá trị nhập"
const old = '<TableHead className="w-1/2">Gi\u00e1 tr\u1ecb nh\u1eadp</TableHead>';
const rep = '<TableHead className="w-1/2"><span>Gi\u00e1 tr\u1ecb nh\u1eadp</span><span className="ml-2 text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">{format(date, "dd/MM/yyyy")}</span></TableHead>';

if (!c.includes(old)) {
    console.log('NOT FOUND - searching similar...');
    const idx = c.indexOf('Gi');
    console.log('Sample around Giá:', c.substring(idx, idx + 100));
    process.exit(1);
}
c = c.replace(old, rep);
fs.writeFileSync(f, c, 'utf8');
console.log('Done!');
