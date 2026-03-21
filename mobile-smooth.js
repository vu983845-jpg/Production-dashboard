const fs = require('fs');
let c = fs.readFileSync('src/app/(protected)/dashboard/page.tsx', 'utf8');

// ============================================================
// FIX 1: KPI summary bar — change to 2-column grid on mobile
//   Before: flex-col sm:flex-row (3 items stacked vertically on mobile = tall)
//   After:  grid grid-cols-2 sm:grid-cols-3 + compact spacing on mobile
// ============================================================
c = c.replace(
    'className="flex flex-col sm:flex-row gap-2 md:gap-4 mb-4 mt-2 bg-white/40 backdrop-blur-md border border-white/60 p-2 md:p-3 rounded-xl shadow-sm"',
    'className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4 mt-2 bg-white/40 backdrop-blur-md border border-white/60 p-2 md:p-3 rounded-xl shadow-sm"'
);

// Fix the individual KPI items — remove flex-1 / border-b/border-r patterns that break grid layout
// Replace item 1 border (was responsive bs class)
c = c.replace(
    'className="flex-1 flex justify-between items-center px-2 md:px-4 border-b sm:border-b-0 sm:border-r border-slate-300/40 pb-2 sm:pb-0"',
    'className="flex justify-between items-center p-1 md:px-4 border-r border-slate-200/50"'
);
c = c.replace(
    'className="flex-1 flex justify-between items-center px-2 md:px-4 border-b sm:border-b-0 sm:border-r border-slate-300/40 py-2 sm:py-0"',
    'className="flex justify-between items-center p-1 md:px-4 border-r border-slate-200/50"'
);
c = c.replace(
    'className="flex-1 flex justify-between items-center px-2 md:px-4 pt-2 sm:pt-0"',
    'className="flex justify-between items-center p-1 md:px-4 col-span-2 sm:col-span-1"'
);
console.log('KPI bar grid fix: OK');

// ============================================================
// FIX 2: KPI label font size — smaller on mobile to fit 2-col grid
//   "text-[10px] md:text-sm" → "text-[9px] md:text-sm"
// ============================================================
c = c.replace(
    /className="text-\[10px\] md:text-sm font-bold text-slate-700 tracking-tight"/g,
    'className="text-[8px] sm:text-[10px] md:text-sm font-bold text-slate-700 tracking-tight"'
);
console.log('KPI label font fix applied');

// ============================================================
// FIX 3: Sticky header — simplify for mobile (less padding)
// ============================================================
c = c.replace(
    'className="flex flex-col md:flex-row items-start md:items-center justify-between space-y-4 md:space-y-0 pb-4 mb-4 backdrop-blur-sm sticky top-0 z-40 bg-white/40 border-b border-white/60 rounded-b-2xl px-2"',
    'className="flex flex-col md:flex-row items-start md:items-center justify-between space-y-2 md:space-y-0 pb-2 md:pb-4 mb-2 md:mb-4 backdrop-blur-sm sticky top-0 z-40 bg-white/40 border-b border-white/60 rounded-b-2xl px-2"'
);
console.log('Sticky header fix: OK');

// ============================================================
// FIX 4: Title font size — too large for mobile
// ============================================================
c = c.replace(
    'className="text-3xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-500 drop-shadow-sm"',
    'className="text-xl md:text-3xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-500 drop-shadow-sm"'
);
console.log('Title size fix: OK');

// ============================================================
// FIX 5: Department card chart area — increase mobile height slightly
//   Before: h-[100px] md:h-[120px]  → After: h-[110px] md:h-[130px]
//   The 100px is too cramped for bars + axis labels
// ============================================================
c = c.replace(
    "'h-[100px] md:h-[120px]'",
    "'h-[110px] md:h-[130px]'"
);
console.log('Chart height fix: OK');

// ============================================================
// FIX 6: Total/fgwh chart height — make taller on mobile for better readability
//   Before: h-[160px] md:h-[200px]  →  h-[180px] md:h-[220px]
// ============================================================
c = c.replace(
    "'h-[160px] md:h-[200px]'",
    "'h-[180px] md:h-[220px]'"
);
console.log('Total chart height fix: OK');

// ============================================================
// FIX 7: Legend — hide on mobile for small department cards
//   Current: only shows on total/fgwh
//   Already correctly shows: {(isTotal || isFgwh) && <Legend .../>}
//   For total cards, Legend should also be hidden on mobile to save space
// ============================================================
c = c.replace(
    '{(isTotal || isFgwh) && <Legend verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: \'9px\', paddingTop: \'5px\' }} />}',
    '{(isTotal || isFgwh) && <Legend verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: \'9px\', paddingTop: \'2px\' }} />}'
);
console.log('Legend padding fix: OK');

// ============================================================
// FIX 8: Header section — hide desc on mobile
// ============================================================
c = c.replace(
    '<p className="text-[10px] md:text-sm text-muted-foreground mt-0.5">',
    '<p className="hidden sm:block text-[10px] md:text-sm text-muted-foreground mt-0.5">'
);
console.log('Header desc hide on mobile: OK');

fs.writeFileSync('src/app/(protected)/dashboard/page.tsx', c);
console.log('\nAll fixes applied!');
