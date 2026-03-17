const fs = require('fs');

// ── input/page.tsx ────────────────────────────────────────────────────────────
{
    const f = 'src/app/(protected)/input/page.tsx';
    let c = fs.readFileSync(f, 'utf8');

    // 1. SHELLING_LINES array: ['A', 'B', 'C', 'D', 'D1'] → ['A', 'B', 'C', 'D1', 'D2']
    c = c.replace("['A', 'B', 'C', 'D', 'D1'] as const", "['A', 'B', 'C', 'D1', 'D2'] as const");

    // 2. Initial state keys: D1 → D2 first (to avoid collision), then D → D1
    c = c.replace("D1: { actual_ton: 0, run_hours: 0, note: '' }", "D2: { actual_ton: 0, run_hours: 0, note: '' }");
    c = c.replace("D: { actual_ton: 0, run_hours: 0, note: '' },\r\n        D2:", "D1: { actual_ton: 0, run_hours: 0, note: '' },\r\n        D2:");

    fs.writeFileSync(f, c, 'utf8');
    console.log('✓ input/page.tsx updated');
}

// ── dashboard/page.tsx ────────────────────────────────────────────────────────
{
    const f = 'src/app/(protected)/dashboard/page.tsx';
    let c = fs.readFileSync(f, 'utf8');

    // SHELLING_LINES_DASH: ['A', 'B', 'C', 'D', 'D1'] → ['A', 'B', 'C', 'D1', 'D2']
    c = c.replace("['A', 'B', 'C', 'D', 'D1'] as const", "['A', 'B', 'C', 'D1', 'D2'] as const");

    // lc color map: D1 → D2, D → D1
    // Handle both in input page and dashboard
    // Pattern: { A: '#3b82f6', B: '#10b981', C: '#f59e0b', D: '#ef4444', D1: '#8b5cf6' }
    c = c.replaceAll(
        "{ A: '#3b82f6', B: '#10b981', C: '#f59e0b', D: '#ef4444', D1: '#8b5cf6' }",
        "{ A: '#3b82f6', B: '#10b981', C: '#f59e0b', D1: '#ef4444', D2: '#8b5cf6' }"
    );

    fs.writeFileSync(f, c, 'utf8');
    console.log('✓ dashboard/page.tsx updated');
}

console.log('\nDone!');
