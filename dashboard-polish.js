const fs = require('fs');
let c = fs.readFileSync('src/app/(protected)/dashboard/page.tsx', 'utf8');

// ============================================================
// FIX 1: CO2e compact display
// Replace the long-number CO2e span with a compact formatted version
// ============================================================
c = c.replace(
    '<span className="text-lg md:text-2xl font-black text-slate-900">{Number(kpiSummary.totalEmission).toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>',
    '<span className="text-lg md:text-2xl font-black text-slate-900">{kpiSummary.totalEmission >= 1000 ? (kpiSummary.totalEmission/1000).toFixed(1) + \'k\' : kpiSummary.totalEmission.toFixed(1)}</span>'
);
console.log('CO2e fix:', c.includes('toFixed(1) + \'k\'') ? 'OK' : 'NOT APPLIED');

// ============================================================
// FIX 2: Use t() for toggle buttons (most visible untranslated)
// ============================================================
// Toggle buttons text
c = c.replace(/>\n                                Biểu đồ\n                            /g, '>{t(\'toggle.chart\')}\n                            ');
c = c.replace(/>\n                                Chi tiết\n                            /g, '>{t(\'toggle.details\')}\n                            ');
c = c.replace(/>\n                                    Theo Line\n                                /g, '>{t(\'toggle.lines\')}\n                                ');

// Chart legend "Thực tế" & "Kế hoạch" (appears many times in Bar/Line names)
// These are chart component name props — replace carefully to avoid breaking JSX
// Only in name= props inside chart Bar/Line components
c = c.replace(/name="Thực tế"/g, 'name={t(\'legend.actual\')}');
c = c.replace(/name="Kế hoạch"/g, 'name={t(\'legend.plan\')}');
c = c.replace(/name="Cần làm\/Ngày"/g, 'name={t(\'legend.daily_needed\')}');
c = c.replace(/name="kWh\/T"/g, 'name={t(\'legend.intensity\')}');
c = c.replace(/name="Phát thải \(T CO₂e\)"/g, 'name={t(\'legend.emission\')}');
c = c.replace(/name="Mục tiêu \(Target\)"/g, 'name={t(\'legend.target\')}');

console.log('i18n chart names: OK');

// ============================================================
// FIX 3: ISP badge - hide on mobile (sm:inline-flex), truncate text
// The ISP badge on CS/HAND is huge and overflows on mobile
// ============================================================
// The badge has class "text-[9px] md:text-[10px] text-blue-600 font-bold ml-0.5 bg-blue-50 px-1 py-0.5 rounded border border-blue-100 uppercase tracking-tighter"
// Change to hidden on xs, visible from sm
c = c.replace(
    'className="text-[9px] md:text-[10px] text-blue-600 font-bold ml-0.5 bg-blue-50 px-1 py-0.5 rounded border border-blue-100 uppercase tracking-tighter"',
    'className="hidden sm:inline text-[9px] text-blue-600 font-bold ml-0.5 bg-blue-50 px-1 py-0.5 rounded border border-blue-100 uppercase tracking-tighter"'
);
console.log('ISP badge mobile hide:', c.includes('hidden sm:inline text-[9px]') ? 'OK' : 'NOT APPLIED');

// ============================================================
// FIX 4: Card name span - remove whitespace-nowrap to allow wrap on mobile
// ============================================================
c = c.replace(
    'className={`flex items-center gap-1.5 uppercase font-black tracking-tight whitespace-nowrap ${(isTotal || isFgwh) ? \'text-base md:text-lg text-primary\' : \'text-[11px] md:text-xs text-slate-800\'}`}',
    'className={`flex items-center gap-1 flex-wrap uppercase font-black tracking-tight ${(isTotal || isFgwh) ? \'text-base md:text-lg text-primary\' : \'text-[10px] md:text-xs text-slate-800\'}`}'
);
console.log('Card name whitespace fix:', c.includes('flex-wrap uppercase font-black') ? 'OK' : 'NOT APPLIED');

// ============================================================
// FIX 5: Stat labels use t() for the most common ones
// ============================================================
c = c.replace('>MTD / KH<', '>{t(\'stat.mtd_plan\')}<');
c = c.replace(/>Thực hiện</g, '>{t(\'stat.actual\')}<');
c = c.replace(/>Đ. NÉN KHÍ</g, '>{t(\'stat.compressor\')}<');
c = c.replace(/>DOWNTIME</g, '>{t(\'stat.downtime\').toUpperCase()}<');

console.log('Stat labels i18n: OK');

fs.writeFileSync('src/app/(protected)/dashboard/page.tsx', c);
console.log('\nAll fixes applied. File written.');
