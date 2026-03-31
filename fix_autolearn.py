path = r'c:\Users\Cashew\.gemini\PPE\factory-dashboard\src\app\(protected)\bao-com\page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

old = (
    "            const { error } = await supabase.from('meal_headcount').upsert([payload], { onConflict: 'work_date,department_name,shift' })\n"
    "            if (error) throw error\n"
    "            setConfirmedRows(prev => new Set([...prev, i]))\n"
    "            setConfirmMsg(prev => ({ ...prev, [i]: { type: 'ok', text: '\u2713 \u0110\u00e3 l\u01b0u' } }))"
)

new = (
    "            const { error } = await supabase.from('meal_headcount').upsert([payload], { onConflict: 'work_date,department_name,shift' })\n"
    "            if (error) throw error\n"
    "\n"
    "            // Auto-save as training example if source text exists\n"
    "            if (r.raw && r.raw.trim()) {\n"
    "                const exampleRecord = {\n"
    "                    senderHint: r.senderHint ?? '',\n"
    "                    date: r.date,\n"
    "                    area: getEffectiveArea(r, i),\n"
    "                    shift: r.shift.replace(/[^1-3]/g, '') || '1',\n"
    "                    officialPresent: r.officialPresent ?? 0,\n"
    "                    officialPresentNote: r.officialPresentNote ?? '',\n"
    "                    officialAbsent: r.officialAbsent ?? 0,\n"
    "                    seasonalPresent: r.seasonalPresent ?? 0,\n"
    "                    seasonalAbsent: r.seasonalAbsent ?? 0,\n"
    "                    ot: r.ot ?? '',\n"
    "                    vegetarian: r.vegetarian ?? null,\n"
    "                }\n"
    "                const autoTitle = `[Auto] ${canonicalName} Ca ${exampleRecord.shift} \u2014 ${r.date}`\n"
    "                await supabase.from('meal_ai_examples').insert({\n"
    "                    title: autoTitle,\n"
    "                    input_text: r.raw.trim(),\n"
    "                    expected_json: [exampleRecord],\n"
    "                    dept_hint: canonicalName || null,\n"
    "                    is_active: true,\n"
    "                })\n"
    "                // Ignore insert errors to not block main save\n"
    "            }\n"
    "\n"
    "            setConfirmedRows(prev => new Set([...prev, i]))\n"
    "            setConfirmMsg(prev => ({ ...prev, [i]: { type: 'ok', text: '\u2713 \u0110\u00e3 l\u01b0u + d\u1ea1y AI' } }))"
)

found = old in content
print('Pattern found:', found)
if found:
    content = content.replace(old, new, 1)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print('Saved. New len:', len(content))
else:
    # Debug: show the actual text around upsert
    idx = content.find("from('meal_headcount').upsert([payload]")
    if idx != -1:
        region = content[idx:idx+400]
        for line in region.split('\n'):
            print(repr(line))
