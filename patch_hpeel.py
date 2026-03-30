"""
Patch bao-com/page.tsx:
1. Add detectHpeelSubgroup() helper before parseBlock
2. In parseBlock(), before return, refine area for generic HPEEL records
   by detecting supervisor names (Huệ, Liên, Dung) in the full block text.
"""

content = open('src/app/(protected)/bao-com/page.tsx', 'rb').read()
text = content.decode('utf-8')

# The file uses CRLF
NL = '\r\n'

# ── 1. Insert detectHpeelSubgroup() helper right before parseBlock ────────────
insert_before = 'function parseBlock(block: string): HeadcountRecord | null {'

helper = (
    '// ─────────────────────────────────────────────────────────────────────────────\r\n'
    '// HPEEL supervisor-name → sub-group detector\r\n'
    '// Call ONLY when area is generic HPEEL/handpeeling/manual peeling/grading.\r\n'
    '// Returns a DEPT_MAP key that already maps to the correct HPEEL_* sub-code,\r\n'
    '// or null if no supervisor name found.\r\n'
    '// ─────────────────────────────────────────────────────────────────────────────\r\n'
    'function detectHpeelSubgroup(blockText: string, hint: string): string | null {\r\n'
    '    // Combine block + senderHint for fuzzy matching\r\n'
    '    const raw = (blockText + \' \' + hint).toLowerCase()\r\n'
    '    // Ms Huệ → Manual Grading (Huệ)\r\n'
    '    if (/ms\\.?\\s*hu[e\u1ec7]|ch[a\xe1]u\\s+hu[e\u1ec7]|em\\s+hu[e\u1ec7]|\\bhu[e\u1ec7]\\b/.test(raw)) {\r\n'
    '        return \'manual grading -shift 1 (ms hu\u1ec7)\'   // maps to HPEEL_GRADING\r\n'
    '    }\r\n'
    '    // Li\u00ean → HPEEL_LIEN\r\n'
    '    if (/\\bli[\u00ea\u1ebbn]\\b/.test(raw)) {\r\n'
    '        return \'manual peeling s1 - li\u00ean\'            // maps to HPEEL_LIEN\r\n'
    '    }\r\n'
    '    // Dung → HPEEL_DUNG\r\n'
    '    if (/\\bdung\\b/.test(raw)) {\r\n'
    '        return \'manual peeling s1 - dung\'                 // maps to HPEEL_DUNG\r\n'
    '    }\r\n'
    '    return null\r\n'
    '}\r\n'
    '\r\n'
    '// Generic HPEEL area keys that should be refined if a supervisor name is found\r\n'
    'const HPEEL_GENERIC_AREAS = new Set([\r\n'
    '    \'hpeel\', \'handpeeling\', \'hand peeling\',\r\n'
    '    \'manual peeling\', \'grading\', \'gradin\',\r\n'
    '])\r\n'
    '\r\n'
)

assert insert_before in text, "Could not find parseBlock anchor"
text = text.replace(insert_before, helper + insert_before, 1)
print("Step 1 OK — inserted detectHpeelSubgroup()")

# ── 2. In parseBlock, insert refinement logic before the final return ─────────
# The return statement uses CRLF — use repr to find exact bytes
# Search for the unique pattern around the return
import re

# Match the return block (with CRLF)
pattern = re.compile(
    r'(    return \{\r\n        senderHint,\r\n        date: dateVal,\r\n        area: area \|\| "—",)',
    re.MULTILINE
)

refinement = (
    '    // ── Refine generic HPEEL area using supervisor name (Hu\u1ec7/Li\u00ean/Dung) ────────\r\n'
    '    const _areaKey = (area || \'\').toLowerCase().trim()\r\n'
    '    const _areaCode = DEPT_MAP[_areaKey]\r\n'
    '    if (!_areaCode || _areaCode === \'HPEEL\' || HPEEL_GENERIC_AREAS.has(_areaKey)) {\r\n'
    '        const refined = detectHpeelSubgroup(text, senderHint)\r\n'
    '        if (refined) area = refined\r\n'
    '    }\r\n'
    '\r\n'
)

m = pattern.search(text)
assert m, "Could not find return anchor in parseBlock"
text = text[:m.start()] + refinement + text[m.start():]
print("Step 2 OK — inserted HPEEL refinement before return")

open('src/app/(protected)/bao-com/page.tsx', 'wb').write(text.encode('utf-8'))
print('Patch applied. New size:', len(text.encode('utf-8')), 'bytes')
