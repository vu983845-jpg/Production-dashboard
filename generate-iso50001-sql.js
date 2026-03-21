const fs = require('fs');

const elecData = `Jan-23	  245,300 
Feb-23	  306,200 
Mar-23	  347,000 
Apr-23	  362,100 
May-23	  369,700 
Jun-23	  365,500 
Jul-23	  360,600 
Aug-23	  367,600 
Sep-23	  368,700 
Oct-23	  384,700 
Nov-23	  326,700 
Dec-23	  232,900 
Jan-24	  357,700 
Feb-24	  195,300 
Mar-24	  376,100 
Apr-24	  353,400 
May-24	  385,600 
Jun-24	  346,100 
Jul-24	  332,400 
Aug-24	  344,500 
Sep-24	  322,100 
Oct-24	  385,100 
Nov-24	  327,000 
Dec-24	  321,275 
Jan-25	  229,248 
Feb-25	  311,123 
Mar-25	  383,158 
Apr-25	  391,792 
May-25	  402,990 
Jun-25	  387,113 
Jul-25	  394,250 
Aug-25	  307,960 
Sep-25	  364,057 
Oct-25	  391,674 
Nov-25	  395,129 
Dec-25	  290,000`;

const rcnWoodData = `Jan-23	  946.7 	  88.00 
Feb-23	  1,350.3 	  149.00 
Mar-23	  1,476.9 	  152.00 
Apr-23	  1,398.6 	  144.00 
May-23	  1,660.1 	  123.00 
Jun-23	  1,652.1 	  171.00 
Jul-23	  1,658.9 	  129.00 
Aug-23	  1,550.5 	  141.00 
Sep-23	  1,380.4 	  141.00 
Oct-23	  1,500.8 	  169.00 
Nov-23	  710.6 	  121.00 
Dec-23	  594.0 	  88.28 
Jan-24	  1,468 	  152.13 
Feb-24	  617 	  72.10 
Mar-24	  1,430 	  170.85 
Apr-24	  1,400 	  164.97 
May-24	  1,515 	  150.17 
Jun-24	  1,420 	  164.79 
Jul-24	  1,405 	  185 
Aug-24	  1,376 	  136 
Sep-24	  1,400 	  150 
Oct-24	  1,369 	  143 
Nov-24	  1,400 	  135 
Dec-24	  1,400 	  153 
Jan-25	  1,081 	  105.02 
Feb-25	  1,300 	  123.20 
Mar-25	  1,600 	  145.60 
Apr-25	  1,611 	  140.70 
May-25	  1,550 	  144.00 
Jun-25	  1,300 	  147.00 
Jul-25	  1,500 	  128 
Aug-25	  1,118 	  113 
Sep-25	  1,650 	  144 
Oct-25	  1,714 	  133 
Nov-25	  1,600 	  130 
Dec-25	  864,742 	  112`;

const monthsMap = {
    'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'May': '05', 'Jun': '06',
    'Jul': '07', 'Aug': '08', 'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
};

const elecLines = elecData.trim().split('\n').map(l => l.trim().split(/\s+/));
const rcnLines = rcnWoodData.trim().split('\n').map(l => l.trim().split(/\s+/));

let sql = `INSERT INTO public.iso50001_monthly_historical (seu_id, month_year, rcn_hap_duoc_kg, actual_energy)
VALUES
`;

const values = [];

for (let i = 0; i < elecLines.length; i++) {
    const monthStr = elecLines[i][0]; // e.g. Jan-23
    const [m, y] = monthStr.split('-');
    const year = '20' + y;
    const month = monthsMap[m];
    const date = `${year}-${month}-01`;

    const elecStr = elecLines[i][1].replace(/,/g, '');
    const elec = parseFloat(elecStr);

    let rcnStr = rcnLines[i][1].replace(/,/g, '');
    let rcn = parseFloat(rcnStr);
    
    // Check if it's the weird Dec-25 value
    if (rcn > 100000) {
       // it's already in kg
    } else {
       rcn = rcn * 1000;
    }

    let woodStr = rcnLines[i][2].replace(/,/g, '');
    let wood = parseFloat(woodStr) * 1000;

    // SEU 1
    values.push(`(1, '${date}', ${rcn}, ${elec})`);
    // SEU 2
    values.push(`(2, '${date}', ${rcn}, ${wood})`);
}

sql += values.join(',\n') + `
ON CONFLICT (seu_id, month_year) 
DO UPDATE SET 
    rcn_hap_duoc_kg = EXCLUDED.rcn_hap_duoc_kg,
    actual_energy = EXCLUDED.actual_energy;
`;

fs.writeFileSync('c:\\Users\\Cashew\\.gemini\\PPE\\factory-dashboard\\iso50001-import-data.sql', sql);
console.log('SQL generated!');
