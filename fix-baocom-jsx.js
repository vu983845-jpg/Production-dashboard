const fs = require('fs')
const path = 'src/app/(protected)/bao-com/page.tsx'
const lines = fs.readFileSync(path, 'utf8').split('\n')

// Lines 928-935 (0-indexed: 927-934) need to be replaced
// Current broken state:
//   928: <select ...
//   929:   className=...
//   930:   value=...
//   931:   onChange=...
//   932: > 
//   933: ) : (   ← WRONG, this is the start of the fallback
//   934:   <span>—</span>
//   935: )}
//   936: </td>

const fix = [
    `                                                                         <select`,
    `                                                                             className="text-xs border border-amber-300 rounded px-1 py-0.5 bg-amber-50 focus:outline-none focus:ring-1 focus:ring-amber-400"`,
    `                                                                             value={areaOverrides[i] ?? ""}`,
    `                                                                             onChange={(e) => setAreaOverrides(prev => ({ ...prev, [i]: e.target.value }))}`,
    `                                                                         >`,
    `                                                                             <option value="">-- Chọn bộ phận --</option>`,
    `                                                                             {deptList.map(d => (`,
    `                                                                                 <option key={d.id} value={d.name_en}>{d.name_en}</option>`,
    `                                                                             ))}`,
    `                                                                         </select>`,
    `                                                                     </div>`,
    `                                                                 ) : (`,
    `                                                                     <span className="text-xs text-muted-foreground">—</span>`,
    `                                                                 )}`,
    `                                                             </td>`,
]

// Replace lines 928-936 (1-indexed) = indices 927-935
lines.splice(927, 9, ...fix)
fs.writeFileSync(path, lines.join('\n'), 'utf8')
console.log('Done, total lines:', lines.length)
// Verify the area around fix
console.log('Lines 925-942:')
lines.slice(924, 941).forEach((l, i) => console.log(`${925+i}: ${l}`))
