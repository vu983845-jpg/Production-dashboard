const fs = require('fs');

const path = 'C:/Users/Cashew/.gemini/PPE/factory-dashboard/src/app/(protected)/dashboard/page.tsx';
let content = fs.readFileSync(path, 'utf8');

// Remove the misplaced peelLineData block (lines 838-871 area, after handleExportCSV starts)
const badBlock = `
            if (peelLineData) {
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
            }\r\n`;

// Remove the bad block
if (content.includes(badBlock)) {
    content = content.replace(badBlock, '\n');
    console.log('Removed bad block');
} else {
    // Try without \r
    const badBlock2 = badBlock.replace(/\r/g, '');
    if (content.includes(badBlock2)) {
        content = content.replace(badBlock2, '\n');
        console.log('Removed bad block (no CRLF)');
    } else {
        console.log('BAD BLOCK NOT FOUND - trying regex');
        const re = /\n            if \(peelLineData\) \{[\s\S]*?\}\r?\n\r?\n        const csvContent/;
        if (re.test(content)) {
            content = content.replace(re, '\n\n        const csvContent');
            console.log('Removed via regex');
        } else {
            console.log('STILL NOT FOUND');
        }
    }
}

// Now add properly INSIDE fetchDashboard, right before setPageLoading(false)
const anchor = '            setPageLoading(false);\r\n        }\r\n        fetchDashboard()\r\n    }, [selectedDept, selectedMonth])';
const anchor2 = '            setPageLoading(false);\n        }\n        fetchDashboard()\n    }, [selectedDept, selectedMonth])';

const goodBlock = `            if (peelLineData) {
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
            }\r\n`;

if (content.includes(anchor)) {
    content = content.replace(anchor, goodBlock + anchor);
    console.log('Inserted peelLineData block in correct location (CRLF)');
} else if (content.includes(anchor2)) {
    content = content.replace(anchor2, goodBlock.replace(/\r/g, '') + anchor2);
    console.log('Inserted peelLineData block in correct location (LF)');
} else {
    console.log('ANCHOR NOT FOUND');
}

fs.writeFileSync(path, content);
console.log('Done');
