/**
 * Fix double-mojibake (Windows-1252 variant) in bao-com/page.tsx
 *
 * Most Vietnamese encoding issues stem from UTF-8 bytes being interpreted as
 * Windows-1252 (cp1252), which is a superset of Latin-1. The range 0x80-0x9F
 * differs between Latin-1 and cp1252.
 */
const fs = require('fs');
const path = require('path');

// Windows-1252 codepoint mapping for 0x80-0x9F (the part that differs from Latin-1)
const cp1252 = {
    0x80: 0x20AC, // €
    0x81: 0x0081, 
    0x82: 0x201A, // ‚
    0x83: 0x0192, // ƒ
    0x84: 0x201E, // „
    0x85: 0x2026, // …
    0x86: 0x2020, // †
    0x87: 0x2021, // ‡
    0x88: 0x02C6, // ˆ
    0x89: 0x2030, // ‰
    0x8A: 0x0160, // Š
    0x8B: 0x2039, // ‹
    0x8C: 0x0152, // Œ
    0x8D: 0x008D,
    0x8E: 0x017D, // Ž
    0x8F: 0x008F,
    0x90: 0x0090,
    0x91: 0x2018, // '
    0x92: 0x2019, // '
    0x93: 0x201C, // "
    0x94: 0x201D, // "
    0x95: 0x2022, // •
    0x96: 0x2013, // –
    0x97: 0x2014, // —
    0x98: 0x02DC, // ˜
    0x99: 0x2122, // ™
    0x9A: 0x0161, // š
    0x9B: 0x203A, // ›
    0x9C: 0x0153, // œ
    0x9D: 0x009D,
    0x9E: 0x017E, // ž
    0x9F: 0x0178, // Ÿ
};

// Build reverse map: Unicode codepoint → cp1252 byte
const unicodeToCp1252 = {};
for (const [byte, code] of Object.entries(cp1252)) {
    unicodeToCp1252[code] = parseInt(byte);
}
// Also add standard Latin-1 range (identical to cp1252 for 0x00-0x7F and 0xA0-0xFF)
for (let i = 0; i <= 0xFF; i++) {
    if (!(i in cp1252)) {
        unicodeToCp1252[i] = i;
    }
}

function unicodeToBytes(str) {
    const bytes = [];
    for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i);
        if (code <= 0xFF) {
            bytes.push(code);
        } else if (code in unicodeToCp1252) {
            bytes.push(unicodeToCp1252[code]);
        } else {
            // Character outside cp1252 range - keep as UTF-8 bytes
            const encoded = Buffer.from(str[i], 'utf8');
            for (const b of encoded) bytes.push(b);
        }
    }
    return Buffer.from(bytes);
}

const FILE = path.join(__dirname, 'src/app/(protected)/bao-com/page.tsx');
const raw = fs.readFileSync(FILE);

// Skip UTF-8 BOM
const hasBOM = raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF;
const content = hasBOM ? raw.slice(3) : raw;

// Step 1: decode current UTF-8 bytes → single mojibake string
const singleMojibake = content.toString('utf8');

// Step 2: map Unicode chars back to cp1252 bytes, then decode as UTF-8
const fixedBytes = unicodeToBytes(singleMojibake);
const fixedContent = fixedBytes.toString('utf8');

// Verify
const idx = fixedContent.indexOf('Headcount Tracker');
console.log('Around title:', fixedContent.slice(idx - 60, idx + 30));

const idx2 = fixedContent.indexOf('HPEEL_GRADING');
console.log('\nHPEEL_GRADING:', fixedContent.slice(idx2, idx2 + 80));

if (fixedContent.includes('Báo Cơm')) {
    console.log('\n✅ "Báo Cơm" decoded correctly');
}
if (fixedContent.includes('–') || fixedContent.includes('\u2013')) {
    console.log('✅ Em dash decoded correctly');
}

fs.writeFileSync(FILE, fixedContent, 'utf8');
console.log('\nFile written. Size:', raw.length, '→', Buffer.byteLength(fixedContent, 'utf8'));
