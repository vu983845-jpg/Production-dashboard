const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/components/bao-com/MealAiChat.tsx');
let t = fs.readFileSync(filePath, 'utf8');

// 1. Fix diff table header: replace the OT+Chay headers with OT+Chay+ChayOT
const oldHeaderSnippet = `<th className="px-3 py-2 text-center">OT</th>
                                                     <th className="px-3 py-2 text-center">Chay</th>
                                                 </tr>`;
const newHeaderSnippet = `<th className="px-3 py-2 text-center">OT</th>
                                                     <th className="px-3 py-2 text-center">Chay</th>
                                                     <th className="px-3 py-2 text-center">Chay OT</th>
                                                 </tr>`;
if (t.includes(oldHeaderSnippet)) {
    t = t.replace(oldHeaderSnippet, newHeaderSnippet);
    console.log('✅ Header fixed');
} else {
    console.log('❌ Header snippet not found');
}

// 2. Fix the generic map that iterates ot_count directly
// Replace the generic field map with custom per-column rendering
const oldBodyMap = `{(["official_present", "seasonal_present", "ot_count", "vegetarian"] as const).map(f => {
                                                            const oldVal = d.existing[f] ?? 0
                                                            const newVal = d.row[f] ?? 0
                                                            const changed = oldVal !== newVal
                                                            return (
                                                                <td key={f} className="px-3 py-2 text-center">
                                                                    {changed ? (
                                                                        <div className="flex flex-col items-center gap-0.5">
                                                                            <span className="line-through text-slate-400 text-xs">{oldVal}</span>
                                                                            <span className="font-bold text-amber-700 bg-amber-50 rounded px-1.5">{newVal}</span>
                                                                        </div>
                                                                    ) : (
                                                                        <span className="text-slate-500">{newVal}</span>
                                                                    )}
                                                                </td>
                                                            )
                                                        })}`;

const newBodyMap = `{/* official_present & seasonal_present */}
                                                        {(["official_present", "seasonal_present", "vegetarian"] as const).map(f => {
                                                            const oldVal = d.existing[f] ?? 0
                                                            const newVal = d.row[f] ?? 0
                                                            const changed = oldVal !== newVal
                                                            return (
                                                                <td key={f} className="px-3 py-2 text-center">
                                                                    {changed ? (
                                                                        <div className="flex flex-col items-center gap-0.5">
                                                                            <span className="line-through text-slate-400 text-xs">{oldVal}</span>
                                                                            <span className="font-bold text-amber-700 bg-amber-50 rounded px-1.5">{newVal}</span>
                                                                        </div>
                                                                    ) : (
                                                                        <span className="text-slate-500">{newVal}</span>
                                                                    )}
                                                                </td>
                                                            )
                                                        })}
                                                        {/* OT column: show TOTAL OT = ot_count + ot_vegetarian */}
                                                        {(() => {
                                                            const oldTotal = (d.existing.ot_count ?? 0) + (d.existing.ot_vegetarian ?? 0)
                                                            const newTotal = (d.row.ot_count ?? 0) + (d.row.ot_vegetarian ?? 0)
                                                            const changed = oldTotal !== newTotal
                                                            return (
                                                                <td className="px-3 py-2 text-center">
                                                                    {changed ? (
                                                                        <div className="flex flex-col items-center gap-0.5">
                                                                            <span className="line-through text-slate-400 text-xs">{oldTotal}</span>
                                                                            <span className="font-bold text-amber-700 bg-amber-50 rounded px-1.5">{newTotal}</span>
                                                                        </div>
                                                                    ) : (
                                                                        <span className="text-slate-500">{newTotal}</span>
                                                                    )}
                                                                </td>
                                                            )
                                                        })()}
                                                        {/* Chay OT column */}
                                                        {(() => {
                                                            const oldOtVeg = d.existing.ot_vegetarian ?? 0
                                                            const newOtVeg = d.row.ot_vegetarian ?? 0
                                                            const changed = oldOtVeg !== newOtVeg
                                                            return (
                                                                <td className="px-3 py-2 text-center text-emerald-700">
                                                                    {changed ? (
                                                                        <div className="flex flex-col items-center gap-0.5">
                                                                            <span className="line-through text-slate-400 text-xs">{oldOtVeg}</span>
                                                                            <span className="font-bold text-emerald-700 bg-emerald-50 rounded px-1.5">{newOtVeg}</span>
                                                                        </div>
                                                                    ) : (
                                                                        <span>{newOtVeg}</span>
                                                                    )}
                                                                </td>
                                                            )
                                                        })()}`;

// Also need to reorder: the generic map had fields in wrong order for the new layout
// New order: official_present, seasonal_present, OT(total), vegetarian, ot_vegetarian
// But the old map had: official_present, seasonal_present, ot_count, vegetarian
// Fix: move vegetarian BEFORE ot_count in the generic map
// Actually in newBodyMap above, the map iterates ["official_present", "seasonal_present", "vegetarian"]
// then separately adds OT total and Chay OT
// The headers are: Chính thức, Thời vụ, OT, Chay, Chay OT
// So the order should be: official_present, seasonal_present, OT(total), vegetarian, Chay OT
// But the map order in newBodyMap is: official_present, seasonal_present, vegetarian, then OT, then Chay OT
// Need to fix the order!

// Actually let me just do individual columns, proper order:
const newBodyMapFinal = `{/* Chính thức */}
                                                        {(() => { const o = d.existing.official_present ?? 0; const n = d.row.official_present ?? 0; const c = o !== n; return (<td className="px-3 py-2 text-center">{c ? <div className="flex flex-col items-center gap-0.5"><span className="line-through text-slate-400 text-xs">{o}</span><span className="font-bold text-amber-700 bg-amber-50 rounded px-1.5">{n}</span></div> : <span className="text-slate-500">{n}</span>}</td>) })()}
                                                        {/* Thời vụ */}
                                                        {(() => { const o = d.existing.seasonal_present ?? 0; const n = d.row.seasonal_present ?? 0; const c = o !== n; return (<td className="px-3 py-2 text-center">{c ? <div className="flex flex-col items-center gap-0.5"><span className="line-through text-slate-400 text-xs">{o}</span><span className="font-bold text-amber-700 bg-amber-50 rounded px-1.5">{n}</span></div> : <span className="text-slate-500">{n}</span>}</td>) })()}
                                                        {/* OT = total (ot_count + ot_vegetarian) */}
                                                        {(() => { const o = (d.existing.ot_count ?? 0) + (d.existing.ot_vegetarian ?? 0); const n = (d.row.ot_count ?? 0) + (d.row.ot_vegetarian ?? 0); const c = o !== n; return (<td className="px-3 py-2 text-center">{c ? <div className="flex flex-col items-center gap-0.5"><span className="line-through text-slate-400 text-xs">{o}</span><span className="font-bold text-amber-700 bg-amber-50 rounded px-1.5">{n}</span></div> : <span className="text-slate-500">{n}</span>}</td>) })()}
                                                        {/* Chay */}
                                                        {(() => { const o = d.existing.vegetarian ?? 0; const n = d.row.vegetarian ?? 0; const c = o !== n; return (<td className="px-3 py-2 text-center">{c ? <div className="flex flex-col items-center gap-0.5"><span className="line-through text-slate-400 text-xs">{o}</span><span className="font-bold text-amber-700 bg-amber-50 rounded px-1.5">{n}</span></div> : <span className="text-slate-500">{n}</span>}</td>) })()}
                                                        {/* Chay OT */}
                                                        {(() => { const o = d.existing.ot_vegetarian ?? 0; const n = d.row.ot_vegetarian ?? 0; const c = o !== n; return (<td className="px-3 py-2 text-center text-emerald-700">{c ? <div className="flex flex-col items-center gap-0.5"><span className="line-through text-slate-400 text-xs">{o}</span><span className="font-bold text-emerald-700 bg-emerald-50 rounded px-1.5">{n}</span></div> : <span>{n}</span>}</td>) })()}`;

if (t.includes(oldBodyMap)) {
    t = t.replace(oldBodyMap, newBodyMapFinal);
    console.log('✅ Body map fixed');
} else {
    // Try to find a partial match for debugging
    const partialSearch = '["official_present", "seasonal_present", "ot_count", "vegetarian"]';
    console.log('❌ Body map snippet not found. Contains partial:', t.includes(partialSearch));
    
    // Try to find by searching line by line
    const lines = t.split('\n');
    lines.forEach((l, i) => {
        if (l.includes('official_present') && l.includes('ot_count')) {
            console.log(`Line ${i}: ${l.trim()}`);
        }
    });
}

fs.writeFileSync(filePath, t, 'utf8');
console.log('Done writing');
