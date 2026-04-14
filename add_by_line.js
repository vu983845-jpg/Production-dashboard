const fs = require('fs');

const path = 'C:/Users/Cashew/.gemini/PPE/factory-dashboard/src/app/(protected)/dashboard/page.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Enable 'By Line' button for PEEL_MC
content = content.replace(
    "{deptCode === 'SHELL' && (",
    "{['SHELL', 'PEEL_MC'].includes(deptCode) && ("
);

// 2. Enable 'By Line' rendering for PEEL_MC
content = content.replace(
    "} : deptCode === \"SHELL\" && deptViewModes[id] === 'lines' ? (",
    "} : ['SHELL', 'PEEL_MC'].includes(deptCode) && deptViewModes[id] === 'lines' ? ("
);

// 3. Right now Shelling uses shellingLineMonthData. We injected `totalBrokenWeight` etc into `peelLineData` but we didn't save the aggregated `peelingLineMonthData` like we did for `shellingLineMonthData`!
// Let me update the node script! Wait, `add_peeling_dashboard.js` did not add `setPeelingLineMonthData`.
// Let's create `peelingLineMonthData` state internally via `dashboardsData` or simply add it!
