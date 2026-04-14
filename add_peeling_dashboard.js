const fs = require('fs');

const path = 'C:/Users/Cashew/.gemini/PPE/factory-dashboard/src/app/(protected)/dashboard/page.tsx';
let content = fs.readFileSync(path, 'utf8');

if (!content.includes('peeling_line_daily')) {
    // Replace Promise.all return signature
    content = content.replace(
        '                { data: othersRaw },\r\n            ] = await Promise.all([',
        '                { data: othersRaw },\r\n                { data: peelLineData },\r\n            ] = await Promise.all(['
    );

    // Replace end of Promise.all block with new fetch
    content = content.replace(
        "                    .order('work_date'),\r\n            ]);",
        `                    .order('work_date'),\r\n                supabase\r\n                    .from('peeling_line_daily')\r\n                    .select('line_code, actual_ton, broken_pct, unpeel_pct')\r\n                    .gte('work_date', startFilter)\r\n                    .lte('work_date', endFilter),\r\n            ]);`
    );

    const shellBlockRegex = /if \(shellLineData\) \{[\s\S]*?\}\r\n\r\n/g;
    const match = shellBlockRegex.exec(content);
    if(match) {
        const insertPos = match.index + match[0].length;
        const processingBlock = `            if (peelLineData) {
                let totalBrokenWeight = 0, totalBrokenTon = 0;
                let totalUnpeelWeight = 0, totalUnpeelTon = 0;
                peelLineData.forEach((r: any) => {
                    const ton = Number(r.actual_ton || 0);
                    const brk = Number(r.broken_pct || 0);
                    const unp = Number(r.unpeel_pct || 0);
                    if (ton > 0 && brk > 0) { totalBrokenWeight += brk * ton; totalBrokenTon += ton; }
                    if (ton > 0 && unp > 0) { totalUnpeelWeight += unp * ton; totalUnpeelTon += ton; }
                });
                const avgBrokenPct = totalBrokenTon > 0 ? totalBrokenWeight / totalBrokenTon : 0;
                const avgUnpeelPct = totalUnpeelTon > 0 ? totalUnpeelWeight / totalUnpeelTon : 0;
                
                if (avgBrokenPct > 0 || avgUnpeelPct > 0) {
                    setDashboardsData(prev => {
                        const peelKey = Object.keys(prev).find(k => {
                            const recs = (dData || []).filter((r: any) => r.department_id === k);
                            return recs.length > 0 && recs[0].dept_code === 'PEEL_MC';
                        });
                        if (!peelKey) return prev;
                        return {
                            ...prev,
                            [peelKey]: {
                                ...prev[peelKey],
                                summary: { 
                                    ...prev[peelKey].summary, 
                                    brokenPct: avgBrokenPct > 0 ? avgBrokenPct : prev[peelKey].summary.brokenPct,
                                    unpeelPct: avgUnpeelPct > 0 ? avgUnpeelPct : prev[peelKey].summary.unpeelPct
                                }
                            }
                        };
                    });
                }
            }\r\n\r\n`;
        content = content.slice(0, insertPos) + processingBlock + content.slice(insertPos);
    }
    
    fs.writeFileSync(path, content);
    console.log('Modified dashboard logic');
} else {
    console.log('Already contains peeling_line_daily');
}
