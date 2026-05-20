"use client"

import { useState, useCallback, useEffect, Fragment } from "react"
import { useRouter } from "next/navigation"
import { MealAiChat } from "@/components/bao-com/MealAiChat"
import {
    ClipboardPaste,
    TableIcon,
    Download,
    RefreshCw,
    CheckCircle2,
    AlertCircle,
    UtensilsCrossed,
    Sparkles,
    Copy,
    Save,
    History,
    CalendarDays,
    Database,
    FileSpreadsheet,
    BarChart3,
    Bell,
    MessageSquare,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { format, parseISO, startOfMonth, endOfMonth } from "date-fns"
import * as XLSX from "xlsx"

// Ca â†’ giá» báº¯t Ä‘áº§u (cho OT hint)
const SHIFT_HOUR: Record<string, string> = { "1": "6h", "2": "14h", "3": "22h" }
// OT meal time: Ca 1 OT â†’ Äƒn 14h Â· Ca 2 OT â†’ Äƒn 18h
const OT_HOUR: Record<string, string> = { "1": "14h", "2": "18h", "3": "6h" }

// CÃ¡c bá»™ pháº­n cáº§n bÃ¡o cÆ¡m theo code trong DB
const EXPECTED_DEPTS = [
    "PEEL", "CS", "STEAM", "PACK", "BORMA", "SHELL", "BOILER", "QC", "FGWH", "HPEEL", "MAINT_SHELL", "MAINT_HCA", "OFFICE", "CLEAN"
]
// These depts only work Ca 1 â€” no need to report Ca 2 / Ca 3
const CA1_ONLY_DEPTS = new Set(["FGWH", "OFFICE"])

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Billing cycle helper: chá»n thÃ¡ng M/YYYY â†’ chu ká»³ 26/(M-1) â†’ 25/M
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ymd(year: number, month: number, day: number): string {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function enumerateDateStrings(from: string, to: string): string[] {
    // Date-only values in Supabase are YYYY-MM-DD strings. Build the sequence in UTC
    // and format from UTC parts so local timezone/DST can never drop the final 25th.
    const [fromY, fromM, fromD] = from.split("-").map(Number)
    const [toY, toM, toD] = to.split("-").map(Number)
    const cur = new Date(Date.UTC(fromY, fromM - 1, fromD))
    const end = Date.UTC(toY, toM - 1, toD)
    const days: string[] = []

    while (cur.getTime() <= end) {
        days.push(ymd(cur.getUTCFullYear(), cur.getUTCMonth() + 1, cur.getUTCDate()))
        cur.setUTCDate(cur.getUTCDate() + 1)
    }

    return days
}

function getBillingCycle(monthStr: string): { from: string; to: string; label: string } {
    // monthStr = "YYYY-MM"
    const [year, month] = monthStr.split("-").map(Number)
    // Start: ngÃ y 26 thÃ¡ng trÆ°á»›c
    const prevMonth = month === 1 ? 12 : month - 1
    const prevYear = month === 1 ? year - 1 : year
    const from = ymd(prevYear, prevMonth, 26)
    // End: ngÃ y 25 thÃ¡ng hiá»‡n táº¡i
    const to = ymd(year, month, 25)
    // Human label: "26/MM-1/YYYY â†’ 25/MM/YYYY"
    const label = `26/${String(prevMonth).padStart(2, "0")}/${prevYear} â†’ 25/${String(month).padStart(2, "0")}/${year}`
    return { from, to, label }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Types
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface HeadcountRecord {
    senderHint: string
    date: string
    area: string
    shift: string
    officialPresent: number | null
    officialPresentNote: string
    officialAbsent: number | null
    seasonalPresent: number | null
    seasonalAbsent: number | null
    ot: string
    vegetarian: number | null
    raw: string
}

interface SavedRecord {
    id: string
    work_date: string
    department_name: string
    department_id: string | null
    shift: string
    official_present: number
    official_absent: number
    seasonal_present: number
    seasonal_absent: number
    ot_count: number
    vegetarian: number
    ot_vegetarian: number
    note: string | null
    created_at: string
}

interface MealStatRow {
    id: string
    work_date: string
    department_id: string | null
    department_name: string
    shift: string
    official_present: number | null
    seasonal_present: number | null
    ot_count: number | null
    ot_vegetarian: number | null
    vegetarian: number | null
}

// Department mapping: Zalo name hoáº·c tÃªn Excel â†’ DB department code
// TÃªn Excel chÃ­nh xÃ¡c tá»« file "BÃ¡o CÆ¡m 2026" Ä‘Æ°á»£c giá»¯ nguyÃªn
const DEPT_MAP: Record<string, string> = {
    // â”€â”€ LOADING / WH (lÃ m viá»‡c táº¡i FGWH vÃ  RCN) â”€â”€
    "loading s1": "FGWH",
    "loading s2": "FGWH",
    "loading s3": "FGWH",
    "loading": "FGWH",
    "warehouse": "FGWH",
    "wh": "FGWH",
    "fgwh": "FGWH",
    "rcn": "FGWH",
    // â”€â”€ STEAMING â”€â”€
    "steaming s1": "STEAM",
    "steaming s2": "STEAM",
    "steaming s3": "STEAM",
    "steaming": "STEAM",
    // â”€â”€ SHELLING â”€â”€
    "shelling s1": "SHELL",
    "shelling thá»i vá»¥ s1": "SHELL",
    "shelling s2": "SHELL",
    "shelling thá»i vá»¥ s2": "SHELL",
    "shelling s3": "SHELL",
    "shelling thá»i vá»¥ s3": "SHELL",
    "shelling": "SHELL",
    // â”€â”€ MAINTENANCE SHELLING â”€â”€
    "maintenance shelling s1": "MAINT_SHELL",
    "maintenance shelling s2": "MAINT_SHELL",
    "maintenance shelling s3": "MAINT_SHELL",
    "maintenance shelling": "MAINT_SHELL",
    "maint shelling": "MAINT_SHELL",
    "maint - shelling": "MAINT_SHELL",
    "báº£o trÃ¬ shelling": "MAINT_SHELL",
    "bao tri shelling": "MAINT_SHELL",
    "báº£o trÃ¬ mÃ¡y cáº¯t": "MAINT_SHELL",
    "bao tri may cat": "MAINT_SHELL",
    "báº£o trÃ¬ may cáº¯t": "MAINT_SHELL",
    "bao tri mÃ¡y cáº¯t": "MAINT_SHELL",
    // â”€â”€ BORMA â”€â”€
    "borma s1": "BORMA",
    "borma thá»i vá»¥ s1": "BORMA",
    "borma s2": "BORMA",
    "borma thá»i vá»¥ s2": "BORMA",
    "borma s3": "BORMA",
    "borma thá»i vá»¥ s3": "BORMA",
    "borma": "BORMA",
    // â”€â”€ PEELING MACHINE (Peeling Mc) â”€â”€
    "peeling s1": "PEEL",
    "peeling thá»i vá»¥ s1": "PEEL",
    "peeling s2": "PEEL",
    "peeling thá»i vá»¥ s2": "PEEL",
    "peeling s3": "PEEL",
    "peeling thá»i vá»¥ s3": "PEEL",
    "peeling": "PEEL",
    "peeling mc": "PEEL",
    "mc peeling": "PEEL",
    // â”€â”€ COLOR SORTER (Machine Grading) â”€â”€
    "machine grading - shift 1": "CS",
    "machine grading  - thá»i vá»¥ 1": "CS",
    "machine grading  - shift 2": "CS",
    "machine grading  thá»i vá»¥ - shift 2": "CS",
    "machine grading  - shift 3": "CS",
    "machine grading  thá»i vá»¥- shift 3": "CS",
    "machine grading": "CS",
    "machine grading shift 1": "CS",
    "machine grading shift 2": "CS",
    "machine grading shift 3": "CS",
    "color sorter": "CS",
    // â”€â”€ HANDPEELING â€” all sub-groups merged to HPEEL â”€â”€
    // Canonical names (new format in DB)
    "hand peeling s1": "HPEEL",
    "hand peeling s2": "HPEEL",
    "hand peeling s3": "HPEEL",
    // Legacy formats still being entered via Zalo/AI
    "manual grading -shift 1 (ms huá»‡)": "HPEEL",
    "manual grading -shift 2 (ms huá»‡)": "HPEEL",
    "manual grading -shift 3 (ms huá»‡)": "HPEEL",
    "manual grading thá»i vá»¥ -shift 1 (ms huá»‡)": "HPEEL",
    "manual grading thá»i vá»¥ -shift 2 (ms huá»‡)": "HPEEL",
    "manual grading thá»i vá»¥ -shift 3 (ms huá»‡)": "HPEEL",
    "manual grading (ms huá»‡)": "HPEEL",
    "manual grading (ms hue)": "HPEEL",
    "manual grading": "HPEEL",
    "manual peeling s1 - liÃªn": "HPEEL",
    "manual peeling s1 - dung": "HPEEL",
    "manual peeling s2 - liÃªn": "HPEEL",
    "manual peeling s2 - dung": "HPEEL",
    "manual peeling s3 - liÃªn": "HPEEL",
    "manual peeling s3 - dung": "HPEEL",
    "manual peeling s1 thá»i vá»¥ - liÃªn": "HPEEL",
    "manual peeling s1 thá»i vá»¥ - dung": "HPEEL",
    "manual peeling s2 thá»i vá»¥ - liÃªn": "HPEEL",
    "manual peeling s2 thá»i vá»¥ - dung": "HPEEL",
    "manual peeling s3 thá»i vá»¥ - liÃªn": "HPEEL",
    "manual peeling s3 thá»i vá»¥ - dung": "HPEEL",
    "manual peeling (dung)": "HPEEL",
    "manual peeling (liÃªn)": "HPEEL",
    "manual peeling (lien)": "HPEEL",
    "manual peeling": "HPEEL",
    "handpeeling": "HPEEL",
    // Zalo aliases
    "grading": "HPEEL",
    "gradin": "HPEEL",

    // â”€â”€ PACKING â”€â”€
    "packing s1": "PACK",
    "packing thá»i vá»¥ s1": "PACK",
    "packing s2": "PACK",
    "packing thá»i vá»¥ s2": "PACK",
    "packing s3": "PACK",
    "packing": "PACK",
    // â”€â”€ BOILER â”€â”€
    "boiler worker s1": "BOILER",
    "boiler worker s2": "BOILER",
    "boiler worker s3": "BOILER",
    "boiler worker": "BOILER",
    "boiler": "BOILER",
    // â”€â”€ MAINTENANCE HIGHCARE â”€â”€
    "maintenance s1": "MAINT_HCA",
    "maintenance s2": "MAINT_HCA",
    "maintenance s3": "MAINT_HCA",
    "maintenance": "MAINT_HCA",
    "maint hca": "MAINT_HCA",
    "maint highcare": "MAINT_HCA",
    "maintenance highcare": "MAINT_HCA",
    "maint - highcare": "MAINT_HCA",
    "maint-highcare": "MAINT_HCA",
    "báº£o trÃ¬ highcare": "MAINT_HCA",
    "bao tri highcare": "MAINT_HCA",
    "báº£o trÃ¬ hca": "MAINT_HCA",
    "bao tri hca": "MAINT_HCA",
    "highcare maint": "MAINT_HCA",
    "highcare maintenance": "MAINT_HCA",
    // â”€â”€ QC â”€â”€
    "qc": "QC",
    "qc s2": "QC",
    "qc s3": "QC",
    // â”€â”€ Táº¬ P Vá»¤ (Cleaning) â”€â”€
    "táº­p vá»¥": "CLEAN", "táº¡p vá»¥": "CLEAN", "tap vu": "CLEAN", "cleaning": "CLEAN",
    // Handpeeling + supervisor name aliases (shift resolved at save time)
    "handpeeling (dung)": "HPEEL_DUNG",
    "handpeeling (liÃªn)": "HPEEL_LIEN", "handpeeling (lien)": "HPEEL_LIEN",
    // â”€â”€ OFFICE â”€â”€
    "office": "OFFICE",
    "vÄƒn phÃ²ng": "OFFICE",
    "van phong": "OFFICE",
    "vp": "OFFICE",
    "office staff": "OFFICE",
    "staff": "OFFICE",
    // â”€â”€ Fallback: AI may return the DB code directly (e.g. "STEAM", "PEEL", "HPEEL") â”€â”€
    // Note: borma/boiler/qc/fgwh already defined above; only add new ones here
    "steam": "STEAM",
    "shell": "SHELL",
    "peel": "PEEL",
    "hpeel": "HPEEL",
    "pack": "PACK",
    "cs": "CS",
    "maint_shell": "MAINT_SHELL",
    "maint_hca": "MAINT_HCA",
    "maint-shell": "MAINT_SHELL",
    "maint-hca": "MAINT_HCA",
}

// HPEEL sub-group display names (used as department_name in DB)
const HPEEL_SUBGROUP_DISPLAY: Record<string, string> = {
    HPEEL_GRADING: 'Manual Grading (Ms Hu\u1ec7)',
    HPEEL_LIEN: 'Manual Peeling (Li\u00ean)',
    HPEEL_DUNG: 'Manual Peeling (Dung)',
}
// Virtual sub-group codes mapping to HPEEL department_id
const HPEEL_SUBCODES = new Set(["HPEEL_GRADING", "HPEEL_LIEN", "HPEEL_DUNG"])

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Parse helpers
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function extractNumber(raw: string): { total: number | null; vegetarian: number | null; note: string } {
    if (!raw || raw.trim() === "" || raw.trim() === ":") return { total: null, vegetarian: null, note: "" }
    const cleaned = raw.trim()
    let vegetarian: number | null = null
    let note = ""
    const vegetarianMatch = cleaned.match(/[+(]?\s*(\d+)\s*chay/i)
    if (vegetarianMatch) {
        vegetarian = parseInt(vegetarianMatch[1])
        note = `(${vegetarian} chay)`
    }
    const sumEqualMatch = cleaned.match(/(\d+)\s*[+]\s*\d+\s*chay\s*=\s*(\d+)/i)
    if (sumEqualMatch) return { total: parseInt(sumEqualMatch[2]), vegetarian, note }
    const plusChayMatch = cleaned.match(/^(\d+)\s*[+]\s*\d+\s*chay/i)
    if (plusChayMatch) return { total: parseInt(plusChayMatch[1]), vegetarian, note }
    const leadingNum = cleaned.match(/^(\d+)/)
    if (leadingNum) return { total: parseInt(leadingNum[1]), vegetarian, note }
    return { total: null, vegetarian: null, note: cleaned }
}

function normalizeDate(raw: string): string {
    if (!raw) return ""
    const m = raw.trim().match(/(\d{1,2})[./\-](\d{1,2})[./\-](\d{2,4})/)
    if (m) {
        const d = m[1].padStart(2, "0")
        const mo = m[2].padStart(2, "0")
        const y = m[3].length === 2 ? `20${m[3]}` : m[3]
        return `${d}/${mo}/${y}`
    }
    return raw.trim()
}

function getField(text: string, labels: string[]): string {
    for (const label of labels) {
        const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        const regex = new RegExp(escaped + "\\s*:?\\s*([^\\n]*)", "i")
        const match = text.match(regex)
        if (match && match[1] !== undefined) return match[1].trim()
    }
    return ""
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// HPEEL supervisor-name â†’ sub-group detector
// Call ONLY when area is generic HPEEL/handpeeling/manual peeling/grading.
// Returns a DEPT_MAP key that already maps to the correct HPEEL_* sub-code,
// or null if no supervisor name found.
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function detectHpeelSubgroup(blockText: string, hint: string): string | null {
    // Combine block + senderHint for fuzzy matching
    const raw = (blockText + ' ' + hint).toLowerCase()
    // Ms Huá»‡ â†’ Manual Grading (Huá»‡)
    if (/ms\.?\s*hu[eá»‡]|ch[aÃ¡]u\s+hu[eá»‡]|em\s+hu[eá»‡]|\bhu[eá»‡]\b/.test(raw)) {
        return 'manual grading -shift 1 (ms huá»‡)'   // maps to HPEEL_GRADING
    }
    // LiÃªn â†’ HPEEL_LIEN
    if (/\bli[Ãªáº»n]\b/.test(raw)) {
        return 'manual peeling s1 - liÃªn'            // maps to HPEEL_LIEN
    }
    // Dung â†’ HPEEL_DUNG
    if (/\bdung\b/.test(raw)) {
        return 'manual peeling s1 - dung'                 // maps to HPEEL_DUNG
    }
    return null
}

// Generic HPEEL area keys that should be refined if a supervisor name is found
const HPEEL_GENERIC_AREAS = new Set([
    'hpeel', 'handpeeling', 'hand peeling',
    'manual peeling', 'grading', 'gradin',
])

function parseBlock(block: string): HeadcountRecord | null {
    const text = block.trim()
    if (text.length < 10) return null

    const dateRaw = getField(text, ["date", "ngÃ y", "deate", "ngay"])
    let dateVal = normalizeDate(dateRaw)
    if (!dateVal) {
        const inlineDate = text.match(/\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b/)
        if (inlineDate) dateVal = normalizeDate(inlineDate[0])
    }

    const hasKeyword = /khu\s*v[á»±u]c|chÃ­nh\s*th[á»©u]c|ca\s*:/i.test(text)
    if (!dateVal && !hasKeyword) return null

    let area = getField(text, ["khu vá»±c", "khu vuc", "bá»™ pháº­n", "bo phan", "bá»™pháº­n"])
    area = area.replace(/\s*ca\s*:\s*\w+.*/i, "").trim()
    // Strip trailing parenthetical hints like "(Dung)", "(Linh)", etc.
    area = area.replace(/\s*\([^)]*\)\s*$/, "").trim()
    // Strip trailing comma or punctuation
    area = area.replace(/[,;.]+$/, "").trim()
    // Fallback: if no "Khu vá»±c:" label found, use the first non-date non-keyword line
    // e.g. "Machine Grading - ca2" as first line â†’ area="Machine Grading", shift="2"
    if (!area) {
        const firstMeaningfulLine = text.split('\n').find(l => {
            const t = l.trim()
            // Skip: empty, bullet/dash lines, lines with colons (are field labels), dates
            return t.length > 2
                && !/^[-â€“â€¢]/.test(t)
                && !t.includes(':')
                && !/^(date|ngÃ y|ngay|chÃ­nh|thá»i|ot|dá»±|trong Ä‘Ã³)/i.test(t)
                && !/^\d{1,2}[./]/.test(t)
        })
        if (firstMeaningfulLine) {
            // Strip " - caN" or " caN" suffix to get clean area
            area = firstMeaningfulLine.trim().replace(/\s*[-â€“]\s*ca\s*\d+/i, '').trim()
        }
    }

    let shift = getField(text, ["ca"])
    const inlineShift = getField(text, ["khu vá»±c", "khu vuc"]).match(/ca\s*:\s*(\S+)/i)
    if (inlineShift) shift = inlineShift[1]
    shift = shift.replace(/\./g, ", ").trim()
    // Strip trailing descriptive text like "vÃ  HC", "vÃ  Highcare" after the shift number
    shift = shift.replace(/\s+vÃ \s+.*/i, "").trim()
    // Keep only leading digits/commas/spaces (shift number part)
    const shiftOnlyMatch = shift.match(/^[\d,\s]+/)
    if (shiftOnlyMatch) shift = shiftOnlyMatch[0].trim()
    // Fallback: extract shift from "Dept - caN" on first line (e.g. "Machine Grading - ca2")
    // Also use this if shift resolved to something non-numeric (getField grabbed wrong line)
    if (!shift || !/^\d/.test(shift)) {
        const firstLineShift = text.split('\n')[0]?.match(/[-â€“]\s*ca\s*(\d+)/i)
        if (firstLineShift) shift = firstLineShift[1]
    }


    // Fuzzy match: ch[Ã­i]nh th[á»©u]c hi[eá»‡]n di[eá»‡]n (any diacritic mix)
    const offPresentFuzzy = text.match(/ch[Ã­i]nh\s+th[á»©u]c\s+hi[eá»‡]n\s+di[eá»‡]n\s*:?\s*([^\n]*)/i)
    let offPresentRaw = offPresentFuzzy ? offPresentFuzzy[1].trim() : getField(text, [
        "chÃ­nh thá»©c hiá»‡n diá»‡n", "chÃ­nh thuc hiá»‡n diá»‡n", "chinh thuc hien dien",
    ])
    // Fallback: bare "ChÃ­nh thá»©c N" without hiá»‡n diá»‡n
    if (!offPresentRaw) {
        const bareMatch = text.match(/ch[Ã­i]nh\s+th[á»©u]c\s*:?\s*(\d[^\n]*)/i)
        if (bareMatch) offPresentRaw = bareMatch[1].trim()
    }
    const { total: officialPresent, vegetarian, note: offNote } = extractNumber(offPresentRaw)

    let offAbsentRaw = getField(text, ["chÃ­nh thá»©c váº¯ng", "chinh thuc vang"])
    // Fallback: bare "Váº¯ng N" (without "chÃ­nh thá»©c" prefix) â€” only when no other vang label found
    if (!offAbsentRaw) {
        // TÃ¬m dÃ²ng chá»©a "váº¯ng" khÃ´ng cÃ³ prefix thá»i vá»¥
        const bareVangMatch = text.match(/(?<!thá»i\s+vá»¥\s+)váº¯ng\s*:?\s*(\d[^\n]*)/i)
        if (bareVangMatch) offAbsentRaw = bareVangMatch[1].trim()
    }
    const { total: officialAbsent } = extractNumber(offAbsentRaw)

    const seasPresentRaw = getField(text, ["thá»i vá»¥ hiá»‡n diá»‡n", "2thá»i vá»¥ hiá»‡n diá»‡n", "thoi vu hien dien"])
    const { total: seasonalPresent } = extractNumber(seasPresentRaw)

    const seasAbsentRaw = getField(text, ["thá»i vá»¥ váº¯ng", "thoi vu vang"])
    const { total: seasonalAbsent } = extractNumber(seasAbsentRaw)

    // OT: grab only the leading number/token (stop before any next keyword or whitespace-separated text)
    let otRaw = getField(text, ["ot"])
    // Trim away anything after the first number + optional symbol (e.g. "0 Dá»± trÃ¹ ngÃ y ...")
    const otNumMatch = otRaw.match(/^(\d+[h]?(?:\.\d+)?(?:\s*giá»|\s*h)?)/i)
    let ot = otNumMatch ? otNumMatch[1].trim() : (otRaw.split(/\s{2,}|(?=d[á»±u]\s*tr[Ã¹u])|(?=ca\s*:)/i)[0] || otRaw).trim()
    // Dá»± trÃ¹ (forecast) is intentionally ignored â€” trailing info after OT is skipped

    let vegTotal = vegetarian
    const vegInOT = ot.match(/(\d+)\s*[p]?\s*[(\[]?\s*(\d+)\s*chay/i)
    if (!vegTotal && vegInOT) vegTotal = parseInt(vegInOT[2])
    const otVegMatch = ot.match(/(\d+)\s*chay/i)
    if (!vegTotal && otVegMatch) vegTotal = parseInt(otVegMatch[1])
    // Fallback: scan line by line for "- Chay: N" or "Chay: N" (from "Trong Ä‘Ã³:" block)
    if (!vegTotal) {
        for (const ln of text.split('\n')) {
            const t = ln.trim().replace(/^[-â€“â€¢]\s*/, '')  // strip leading bullet
            const m = t.match(/^chay\s*:\s*(\d+)/i)
            if (m) { vegTotal = parseInt(m[1]); break }
        }
    }



    const lines = text.split("\n")
    let senderHint = ""
    for (const line of lines) {
        const l = line.trim()
        if (l && !/khu\s*v[á»±u]c|ca\s*:|chÃ­nh|thá»i|date|ngÃ y|deate|ot:|dá»±/i.test(l)) {
            if (!/^\d{1,2}[./]/.test(l) && l.length < 60) {
                senderHint = l
                break
            }
        }
    }

    // â”€â”€ Refine generic HPEEL area using supervisor name (Huá»‡/LiÃªn/Dung) â”€â”€â”€â”€â”€â”€â”€â”€
    const _areaKey = (area || '').toLowerCase().trim()
    const _areaCode = DEPT_MAP[_areaKey]
    if (!_areaCode || _areaCode === 'HPEEL' || HPEEL_GENERIC_AREAS.has(_areaKey)) {
        const refined = detectHpeelSubgroup(text, senderHint)
        if (refined) area = refined
    }

    return {
        senderHint,
        date: dateVal,
        area: area || "â€”",
        shift: shift || "â€”",
        officialPresent,
        officialPresentNote: offNote,
        officialAbsent,
        seasonalPresent,
        seasonalAbsent,
        ot: ot || "0",
        vegetarian: vegTotal,

        raw: text,
    }
}

/**
 * Zalo Chrome extension exports each message in triple format:
 * [CONTENT\nTIME] CONTENT\nTIME: CONTENT\nTIME
 *
 * This function strips the duplication to keep only the first copy.
 * Also removes the leading [ from block starters.
 */
function cleanZaloExportTriple(raw: string): string {
    let text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

    // Step 1: Collapse timestamped triples:
    //   HH:MM] ...copy2... HH:MM: ...copy3... HH:MM  â†’  HH:MM
    // Use lazy match; \1 anchors stops at the correct timestamp occurrence.
    text = text.replace(
        /(\d{1,2}:\d{2})\]([\s\S]+?)\1\s*:[\s\S]+?\1(?=\n|$)/g,
        '$1'
    )

    // Step 2: Remove remaining "] SENDER" orphan endings (messages without timestamp in bracket)
    //   Handles messages like: [MSG] MSG: MSG (single-line or short).
    text = text.replace(/\]\s*[^\n\[]+(?=\n|$)/g, '')

    // Step 3: Remove leading [ from each line that starts a message block
    text = text.replace(/^\[(?!HÃ¬nh áº£nh|Sticker|Video|File)/gm, '')

    // Step 4: Remove Zalo emoji/sticker reaction lines
    text = text.replace(/^\/-[a-zA-Z]+\s*$/gm, '')
    text = text.replace(/^[:\-]{0,2}[()><oOhH]+\s*$/gm, '').replace(/\n{3,}/g, '\n\n')

    return text
}

// â”€â”€â”€ QC Compact format parser â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Handles: "Bá»™ pháº­n: QC\nCa1: 12 (1 chay) OT: 3\nCa2: 6 (2 chay)\nCa3: 4 OT: 2"
function parseQCCompact(block: string): HeadcountRecord[] {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean)
    const COMPACT_CA = /^[Cc]a\s*([1-3])\s*:\s*(\d+)/
    if (!lines.some(l => COMPACT_CA.test(l))) return []

    let dateVal = ''
    let area = ''
    for (const l of lines) {
        const dm = l.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/)
        if (dm && !dateVal) dateVal = normalizeDate(dm[0])
        if (/date\s*:/i.test(l) && !dateVal) dateVal = normalizeDate(l.replace(/date\s*:/i, '').trim())
        const am = l.match(/(?:b[á»™o]\s*ph[aáº­]n|b[á»™o]ph[aáº­]n|khu\s*v[á»±u]c)\s*:?\s*(.+)/i)
        if (am && !area) area = am[1].replace(/[,;.]+$/, '').trim()
    }

    const records: HeadcountRecord[] = []
    for (const l of lines) {
        const m = l.match(/^[Cc]a\s*([1-3])\s*:\s*(.+)/)
        if (!m) continue
        const shift = m[1]
        const rest = m[2].trim()
        // "12 (1 chay) OT: 3" | "6 (2 chay)" | "4 OT: 2"
        const parsed = rest.match(/^(\d+)\s*(?:\(\s*(\d+)\s*chay\s*\))?\s*(?:OT\s*:?\s*(\d+))?/i)
        if (!parsed) continue
        const p = parseInt(parsed[1])
        records.push({
            senderHint: '',
            date: dateVal,
            area: area || 'QC',
            shift,
            officialPresent: isNaN(p) ? null : p,
            officialPresentNote: '',
            officialAbsent: null,
            seasonalPresent: null,
            seasonalAbsent: null,
            ot: parsed[3] ?? '',
            vegetarian: parsed[2] ? parseInt(parsed[2]) : null,
            raw: block,
        })
    }
    return records
}

function splitIntoBlocks(rawText: string): string[] {
    const text = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
    const doubleNewlineSections = text.split(/\n{2,}/)
    const blocks: string[] = []
    for (const section of doubleNewlineSections) {
        const trimmed = section.trim()
        if (!trimmed) continue
        const hasDate = /\b\d{1,2}[./]\d{1,2}[./]\d{4}\b/.test(trimmed)
        const hasArea = /khu\s*v[á»±u]c/i.test(trimmed)
        if (hasDate || hasArea) blocks.push(trimmed)
    }
    if (blocks.length === 0) {
        let current: string[] = []
        for (const line of text.split("\n")) {
            const isDateLine = /^\d{1,2}[./]\d{1,2}[./]\d{4}$/.test(line.trim())
            const hasDateKeyword = /date\s*:/i.test(line)
            if ((isDateLine || hasDateKeyword) && current.length > 2) {
                blocks.push(current.join("\n"))
                current = [line]
            } else {
                current.push(line)
            }
        }
        if (current.length > 0) blocks.push(current.join("\n"))
    }
    return blocks.filter((b) => b.length > 5)
}

// Detect/split a single area block that contains multiple "Ca N" sub-sections
// e.g. "Ca 1\nChÃ­nh thá»©c 8\nCa 2\nChÃ­nh thá»©c 1" â†’ 2 sub-blocks each with inherited date+area
function splitMultiShiftBlock(block: string): string[] {
    const lines = block.split("\n")
    // Regex to detect a bare "Ca N" line (shift marker, N = 1/2/3)
    const IS_SHIFT_LINE = /^ca\s+([1-3])(?:\s|$|v[Ã a])/i

    // Collect header lines (date, area) â€” before first bare Ca line
    const headerLines: string[] = []
    let firstCaIdx = -1
    for (let i = 0; i < lines.length; i++) {
        const l = lines[i].trim()
        if (IS_SHIFT_LINE.test(l)) {
            firstCaIdx = i
            break
        }
        headerLines.push(lines[i])
    }
    if (firstCaIdx === -1) return [block]

    // Collect indices of all shift-start lines
    const caIndices: number[] = []
    for (let i = firstCaIdx; i < lines.length; i++) {
        if (IS_SHIFT_LINE.test(lines[i].trim())) caIndices.push(i)
    }
    if (caIndices.length <= 1) return [block]

    // Build sub-blocks: header + each Ca section
    const subBlocks: string[] = []
    for (let ci = 0; ci < caIndices.length; ci++) {
        const start = caIndices[ci]
        const end = ci + 1 < caIndices.length ? caIndices[ci + 1] : lines.length
        // Convert "Ca N ..." bare line to "Ca: N" so getField("ca") can parse it
        const shiftLine = lines[start].trim().replace(/^ca\s+([1-3]).*/i, "Ca: $1")
        const sectionLines = [shiftLine, ...lines.slice(start + 1, end)]
        subBlocks.push([...headerLines, ...sectionLines].join("\n"))
    }
    return subBlocks
}

/** Dedup records by (date + area + shift): last-wins (later message overrides earlier) */
function deduplicateRecords(records: HeadcountRecord[]): HeadcountRecord[] {
    const seen = new Map<string, HeadcountRecord>()
    for (const rec of records) {
        const key = `${rec.date}|${rec.area.toLowerCase().trim()}|${rec.shift}`
        seen.set(key, rec)  // last occurrence wins
    }
    return Array.from(seen.values())
}

/**
 * Expand a single record whose shift is "1, 2, 3" (or "1,2" etc.) into N records.
 * Headcount values are DIVIDED EQUALLY across shifts (Boiler pattern).
 */
function expandMultiShiftRecord(record: HeadcountRecord): HeadcountRecord[] {
    const shiftNums = record.shift.match(/[1-3]/g)
    if (!shiftNums || shiftNums.length <= 1) return [record]
    const n = shiftNums.length
    const div = (v: number | null) => v != null ? Math.round(v / n) : null
    return shiftNums.map(s => ({
        ...record,
        shift: s,
        officialPresent: div(record.officialPresent),
        officialAbsent: div(record.officialAbsent),
        seasonalPresent: div(record.seasonalPresent),
        seasonalAbsent: div(record.seasonalAbsent),
    }))
}

function parseZaloText(rawText: string): HeadcountRecord[] {
    // Step 1: Strip Zalo extension triple-duplication format
    const cleanText = cleanZaloExportTriple(rawText)
    const blocks = splitIntoBlocks(cleanText)
    const records: HeadcountRecord[] = []
    for (const block of blocks) {
        // Try QC compact format first (Ca1: 12 (1 chay) OT: 3)
        const qcRecs = parseQCCompact(block)
        if (qcRecs.length > 0) { records.push(...qcRecs); continue }
        // Expand multi-shift blocks (1 area, many shifts on separate lines)
        const subBlocks = splitMultiShiftBlock(block)
        for (const sub of subBlocks) {
            const record = parseBlock(sub)
            if (record && (record.date || record.area !== "â€”")) {
                // Expand "Ca: 1.2.3" into 3 records, headcount divided equally
                records.push(...expandMultiShiftRecord(record))
            }
        }
    }
    // Step 2: Dedup by (date+area+shift), keeping last occurrence
    return deduplicateRecords(records)
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// CSV Export
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function exportCSV(records: HeadcountRecord[]) {
    const headers = ["NgÃ y", "Khu vá»±c", "Ca", "ChÃ­nh thá»©c Hiá»‡n diá»‡n", "ChÃ­nh thá»©c Váº¯ng", "Thá»i vá»¥ Hiá»‡n diá»‡n", "Thá»i vá»¥ Váº¯ng", "TÄƒng ca", "Chay"]
    const rows = records.map((r) => [
        r.date, r.area, r.shift,
        r.officialPresent ?? "", r.officialAbsent ?? "",
        r.seasonalPresent ?? "", r.seasonalAbsent ?? "",
        r.ot, r.vegetarian ?? "",
    ])
    const csvContent =
        "\uFEFF" +
        [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n")
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    const today = new Date().toISOString().slice(0, 10)
    link.download = `bao-com-${today}.csv`
    link.click()
    URL.revokeObjectURL(url)
}

function exportHistoryCSV(records: SavedRecord[]) {
    const headers = ["NgÃ y", "Bá»™ pháº­n", "Ca", "ChÃ­nh thá»©c Hiá»‡n diá»‡n", "ChÃ­nh thá»©c Váº¯ng", "Thá»i vá»¥ Hiá»‡n diá»‡n", "Thá»i vá»¥ Váº¯ng", "TÄƒng ca", "Chay", "Ghi chÃº"]
    const rows = records.map((r) => [
        r.work_date, r.department_name, `Ca ${r.shift}`,
        r.official_present, r.official_absent,
        r.seasonal_present, r.seasonal_absent,
        r.ot_count, r.vegetarian, r.note || "",
    ])
    const csvContent =
        "\uFEFF" +
        [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n")
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `headcount-history-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// OT String Parser â€” handles multiple formats:
//   "26p (10 chay)"   â†’ máº·n=16, chay=10  (X=total, Y=chay, máº·n=X-Y)
//   "13 máº·n (2 chay)" â†’ máº·n=13, chay=2   (explicit "máº·n" â†’ X is already máº·n)
//   "11+8chay"        â†’ máº·n=11, chay=8   (explicit split)
//   "5p máº·n"          â†’ máº·n=5, chay=0
//   "6"               â†’ máº·n=6, chay=0
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function parseOTString(ot: string): { otCount: number; otVegetarian: number } {
    const s = (ot || '').trim()
    if (!s || s === '0' || s === 'â€”') return { otCount: 0, otVegetarian: 0 }

    // Pattern 1: "X máº·n (Y chay)" OR "X máº·n Y chay" â€” X is already máº·n
    const manChayMatch = s.match(/(\d+)\s*(?:p\s*)?m[áº·a]n\s*[\s(,]?\s*(\d+)\s*chay/i)
    if (manChayMatch) {
        return { otCount: parseInt(manChayMatch[1]), otVegetarian: parseInt(manChayMatch[2]) }
    }

    // Pattern 2: "X+Ychay" OR "X + Y chay" â€” explicit split
    const plusChayMatch = s.match(/(\d+)\s*\+\s*(\d+)\s*chay/i)
    if (plusChayMatch) {
        return { otCount: parseInt(plusChayMatch[1]), otVegetarian: parseInt(plusChayMatch[2]) }
    }

    // Pattern 3: "X p (Y chay)" OR "X (Y chay)" â€” X is TOTAL, Y is chay
    const totalChayMatch = s.match(/(\d+)\s*(?:p\s*)?\(?\s*(\d+)\s*chay/i)
    if (totalChayMatch) {
        const total = parseInt(totalChayMatch[1])
        const chay = parseInt(totalChayMatch[2])
        return { otCount: Math.max(0, total - chay), otVegetarian: chay }
    }

    // Pattern 4: "Xp máº·n" OR "X máº·n" â€” máº·n only, no chay
    const manOnly = s.match(/(\d+)\s*(?:p\s*)?m[áº·a]n/i)
    if (manOnly) {
        return { otCount: parseInt(manOnly[1]), otVegetarian: 0 }
    }

    // Fallback: just a number
    const num = parseInt(s)
    return { otCount: isNaN(num) ? 0 : num, otVegetarian: 0 }
}


function dateToISO(ddmmyyyy: string): string {
    const parts = ddmmyyyy.split("/")
    if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`
    return ddmmyyyy
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Component
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function BaoCom() {
    const supabase = createClient()
    const [rawText, setRawText] = useState("")
    const [records, setRecords] = useState<HeadcountRecord[]>([])
    const [parsed, setParsed] = useState(false)
    const [copied, setCopied] = useState(false)
    const [activeTab, setActiveTab] = useState<"history" | "kitchen" | "monthly" | "ai-chat">("ai-chat")

    const [areaOverrides, setAreaOverrides] = useState<Record<number, string>>({})
    const [showSummary, setShowSummary] = useState(false)
    const [copiedSummary, setCopiedSummary] = useState(false)

    // Helper: get effective area (overridden or parsed)
    const getEffectiveArea = (r: HeadcountRecord, i: number) => areaOverrides[i] ?? r.area
    const getEffectiveDeptId = (r: HeadcountRecord, i: number): string | null => {
        const area = getEffectiveArea(r, i)
        const lower = area.toLowerCase().trim()
        const shift = r.shift?.replace(/[^1-3]/g, '') || ''
        const s = /^[123]$/.test(shift) ? shift : '1'

        // Handpeeling with supervisor â†’ shift-specific dept in DB
        const isDung = /dung/i.test(lower)
        const isLien = /li[Ãªnáº¿]n/i.test(lower)
        const isHue = /hu[á»‡Ãª]/i.test(lower)
        if ((isDung || isLien) && (lower.includes('handpeeling') || lower.includes('manual peeling') || lower.includes('peeling'))) {
            const sup = isDung ? 'Dung' : 'LiÃªn'
            const dept = deptList.find(d =>
                d.name_en.toLowerCase().includes(`s${s}`) &&
                d.name_en.toLowerCase().includes(sup.toLowerCase()) &&
                d.name_en.toLowerCase().includes('peeling')
            )
            return dept?.id ?? deptList.find(d => d.code === 'HPEEL')?.id ?? null
        }
        if (isHue && (lower.includes('grading') || lower.includes('manual'))) {
            const dept = deptList.find(d =>
                /grading/i.test(d.name_en) && new RegExp(`shift\\s*${s}`, 'i').test(d.name_en)
            )
            return dept?.id ?? deptList.find(d => d.code === 'HPEEL')?.id ?? null
        }
        // Táº­p vá»¥ â†’ Cleaning dept by name
        if (/t[áº¡á¸¥Ã¢]p\s*v[á»¥u]/i.test(area)) {
            const dept = deptList.find(d => /clean/i.test(d.name_en) || /t[áº¡Ã¢]p\s*v[á»¥u]/i.test(d.name_en))
            if (dept) return dept.id
        }
        return findDeptId(area)
    }
    const [saving, setSaving] = useState(false)
    const [saveMsg, setSaveMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null)
    const [deptList, setDeptList] = useState<{ id: string; code: string; name_en: string }[]>([])
    const [userRole, setUserRole] = useState("")
    const [roleLoaded, setRoleLoaded] = useState(false)
    const router = useRouter()

    // History state
    const [historyRecords, setHistoryRecords] = useState<SavedRecord[]>([])
    const [historyLoading, setHistoryLoading] = useState(false)
    const [historyFrom, setHistoryFrom] = useState(() => {
        const d = new Date(); d.setDate(d.getDate() - 6); return d.toISOString().slice(0, 10)
    })
    const [historyTo, setHistoryTo] = useState(new Date().toISOString().slice(0, 10))
    const [histEditId, setHistEditId] = useState<string | null>(null)
    const [histEditFields, setHistEditFields] = useState<{
        official_present: number; official_absent: number;
        seasonal_present: number; seasonal_absent: number;
        ot_count: number; vegetarian: number
    }>({ official_present: 0, official_absent: 0, seasonal_present: 0, seasonal_absent: 0, ot_count: 0, vegetarian: 0 })
    // Refresh key: tÄƒng lÃªn má»—i khi kitchen tab thay Ä‘á»•i data â†’ trigger re-fetch history
    const [historyRefreshKey, setHistoryRefreshKey] = useState(0)

    // Load departments + user role on mount
    useEffect(() => {
        async function init() {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                // Try profiles table first; fallback to JWT user_metadata
                const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
                if (profile?.role) {
                    setUserRole(profile.role)
                } else {
                    const metaRole = user.user_metadata?.role as string | undefined
                    if (metaRole) setUserRole(metaRole)
                }
            }
            const { data: depts } = await supabase.from("departments").select("id, code, name_en").order("sort_order")
            if (depts) setDeptList(depts)
            setRoleLoaded(true)
        }
        init()
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    const RAW_ALLOWED_ROLES = ["hr", "hr_admin", "hse", "hse_admin", "admin", "plant_manager", "HSE"]
    const normalizedRole = userRole ? userRole.toLowerCase().replace(/[\s-]/g, '_') : ''
    const canEdit = RAW_ALLOWED_ROLES.map(r => r.toLowerCase().replace(/[\s-]/g, '_')).includes(normalizedRole)
    const canSave = canEdit

    // Access guard â€” show after role is loaded
    if (roleLoaded && !canEdit) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center p-8">
                <UtensilsCrossed className="h-16 w-16 text-muted-foreground/40" />
                <h1 className="text-2xl font-bold text-muted-foreground">KhÃ´ng cÃ³ quyá»n truy cáº­p</h1>
                <p className="text-sm text-muted-foreground max-w-sm">
                    Chá»©c nÄƒng BÃ¡o CÆ¡m chá»‰ dÃ nh cho HR, HSE vÃ  Admin.
                </p>
                <Button variant="outline" onClick={() => router.push('/dashboard')}>â† Vá» Dashboard</Button>
            </div>
        )
    }

    // â”€â”€â”€ Build summary text for kitchen â”€â”€â”€
    const buildSummaryText = (): string => {
        // Group by date+shift
        const groups = new Map<string, HeadcountRecord[]>()
        records.forEach((r, i) => {
            const area = getEffectiveArea(r, i)
            const key = `${r.date}|||${r.shift}`
            if (!groups.has(key)) groups.set(key, [])
            groups.get(key)!.push({ ...r, area })
        })
        const lines: string[] = []
        groups.forEach((recs, key) => {
            const [date, shift] = key.split("|||")
            const totalPresent = recs.reduce((s, r) => s + Math.max((r.officialPresent ?? 0) + (r.seasonalPresent ?? 0), r.vegetarian ?? 0), 0)
            const totalVeg = recs.reduce((s, r) => s + (r.vegetarian ?? 0), 0)
            const totalOT = recs.reduce((s, r) => s + (parseInt(r.ot) || 0), 0)
            const man = Math.max(0, totalPresent - totalVeg)
            const otHour = OT_HOUR[shift] ?? ""
            let block = `NgÃ y ${date}\nCa ${shift}: tá»•ng cá»™ng ${man} pháº§n máº·n (chay: ${totalVeg} pháº§n)`
            if (totalOT > 0) block += `\n${totalOT} OT (Äƒn lÃºc ${otHour})`
            lines.push(block)
        })
        return lines.join("\n\n")
    }

    // â”€â”€â”€ Check if area has a DEPT_MAP rule â”€â”€â”€
    const hasDeptRule = (area: string): boolean => {
        const key = area.toLowerCase().trim()
        return Object.prototype.hasOwnProperty.call(DEPT_MAP, key)
    }

    // â”€â”€â”€ History edit / delete handlers â”€â”€â”€
    const handleHistSave = async (id: string) => {
        const res = await fetch('/api/meal-headcount', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id,
                official_present: histEditFields.official_present,
                official_absent: histEditFields.official_absent,
                seasonal_present: histEditFields.seasonal_present,
                seasonal_absent: histEditFields.seasonal_absent,
                ot_count: histEditFields.ot_count,
                vegetarian: histEditFields.vegetarian,
            })
        })
        const json = await res.json()
        if (!res.ok) {
            alert('Lá»—i lÆ°u: ' + (json.error || res.statusText))
            return
        }
        setHistoryRecords(prev => prev.map(r => r.id === id ? { ...r, ...histEditFields } : r))
        // Cáº­p nháº­t luÃ´n summaryData náº¿u Ä‘ang hiá»ƒn
        setSummaryData(prev => prev ? prev.map(r =>
            r.id === id ? { ...r, ...histEditFields } : r
        ) : prev)
        setHistEditId(null)
    }

    const handleHistDelete = async (id: string) => {
        if (!confirm("XÃ³a báº£n ghi nÃ y?")) return
        const res = await fetch(`/api/meal-headcount?id=${id}`, { method: 'DELETE' })
        const json = await res.json()
        if (!res.ok) {
            alert("Lá»—i: " + (json.error || res.statusText))
            return
        }
        setHistoryRecords(prev => prev.filter(r => r.id !== id))
        // Cáº­p nháº­t luÃ´n summaryData náº¿u Ä‘ang hiá»ƒn
        setSummaryData(prev => prev ? prev.filter(r => r.id !== id) : prev)
    }

    // â”€â”€â”€ Monthly stats state â”€â”€â”€
    const [statsMonth, setStatsMonth] = useState<string>(() => new Date().toISOString().slice(0, 7))
    const [statsData, setStatsData] = useState<MealStatRow[] | null>(null)
    const [statsLoading, setStatsLoading] = useState(false)
    const [statsError, setStatsError] = useState<string | null>(null)
    // Row-level edit mode state (monthly table)
    const [editingRowKey, setEditingRowKey] = useState<string | null>(null)
    const [rowEditDrafts, setRowEditDrafts] = useState<Record<string, string>>({})
    const [rowSaving, setRowSaving] = useState(false)

    useEffect(() => {
        if (activeTab === "monthly") {
            fetchMonthStats()
        }
    }, [activeTab, statsMonth]) // eslint-disable-line react-hooks/exhaustive-deps

    const fetchMonthStats = async () => {
        setStatsLoading(true)
        setStatsError(null)
        setStatsData(null)
        try {
            // Chu ká»³ tiá»n cÆ¡m: 26 thÃ¡ng trÆ°á»›c â†’ 25 thÃ¡ng hiá»‡n táº¡i
            const { from, to } = getBillingCycle(statsMonth)
            const { data, error } = await supabase
                .from("meal_headcount")
                .select("id, work_date, department_id, department_name, shift, official_present, seasonal_present, ot_count, ot_vegetarian, vegetarian")
                .gte("work_date", from)
                .lte("work_date", to)
                .order("work_date")
            if (error) throw error
            setStatsData((data ?? []) as MealStatRow[])
        } catch (e: unknown) {
            setStatsError(e instanceof Error ? e.message : String(e))
        } finally {
            setStatsLoading(false)
        }
    }

    // Thá»© tá»± bá»™ pháº­n theo layout Excel
    const DEPT_ORDER = ['FGWH', 'STEAM', 'SHELL', 'MAINT_SHELL', 'BORMA', 'PEEL', 'CS', 'HPEEL', 'PACK', 'BOILER', 'MAINT_HCA', 'CLEAN', 'QC', 'OFFICE']
    const SHIFT_ORDER = ['1', '2', '3', 'HC', 'OT']
    // Alias: these dept codes are merged into another group in the monthly report
    // HAND (HANDPEELING) contains sub-supervisors LiÃªn/Dung â†’ merge into HPEEL group
    const DEPT_CODE_ALIAS: Record<string, string> = { PEEL_MC: 'PEEL', HAND: 'HPEEL' }

    // TÃªn hiá»ƒn thá»‹ Ä‘áº¹p nhÆ° trong Excel
    const DEPT_DISPLAY: Record<string, string> = {
        FGWH: 'Loading',
        STEAM: 'Steaming',
        SHELL: 'Shelling',
        MAINT_SHELL: 'Maintenance shelling',
        BORMA: 'Borma',
        PEEL: 'Peeling',
        CS: 'Machine Grading',
        HPEEL: 'Hand Peeling',
        PACK: 'Packing',
        BOILER: 'Boiler worker',
        MAINT_HCA: 'Maintenance',
        CLEAN: 'Cleaning worker',
        QC: 'QC',
        OFFICE: 'Office',
    }

    const getMonthlyDbDepartmentName = (sectionName: string, deptCode: string) => {
        if (deptCode !== 'HPEEL') return sectionName
        const name = sectionName.toLowerCase()
        if (name.includes('dung')) return 'Hand Peeling (Dung)'
        if (name.includes('loan') || name.includes('grading') || name.includes('hu')) return 'Manual Grading (Ms Huệ)'
        if (name.includes('liên') || name.includes('lien') || name.includes(' - li')) return 'Hand Peeling (Liên)'
        return sectionName
    }

    // Excel Section row order within each dept group
    const SECTION_ORDER: Record<string, string[]> = {
        FGWH: ['Loading S1', 'Loading S2', 'Loading S3'],
        STEAM: ['Steaming S1', 'Steaming S2', 'Steaming S3'],
        SHELL: ['Shelling S1', 'Shelling thá»i vá»¥ S1', 'Shelling S2', 'Shelling thá»i vá»¥ S2', 'Shelling S3', 'Shelling thá»i vá»¥ S3'],
        MAINT_SHELL: ['Maintenance shelling S1', 'Maintenance shelling S2', 'Maintenance shelling S3'],
        BORMA: ['Borma S1', 'Borma thá»i vá»¥ S1', 'Borma S2', 'Borma thá»i vá»¥ S2', 'Borma S3', 'Borma thá»i vá»¥ S3'],
        PEEL: ['Peeling S1', 'Peeling thá»i vá»¥ S1', 'Peeling S2', 'Peeling thá»i vá»¥ S2', 'Peeling S3', 'Peeling thá»i vá»¥ S3'],
        CS: ['Machine Grading - shift 1', 'Machine Grading  - thá»i vá»¥ 1', 'Machine Grading  - shift 2', 'Machine Grading  thá»i vá»¥ - shift 2', 'Machine Grading  - shift 3', 'Machine Grading  thá»i vá»¥- shift 3'],
        HPEEL: ['Manual Grading -Shift 1 (Ms Huá»‡)', 'Manual Grading Thá»i vá»¥ -Shift 1 (Ms Huá»‡)', 'Manual Grading -Shift 2 (Ms Huá»‡)', 'Manual Grading Thá»i vá»¥ -Shift 2 (Ms Huá»‡)', 'Manual Grading -Shift 3 (Ms Huá»‡)', 'Manual Grading Thá»i vá»¥ -Shift 3 (Ms Huá»‡)', 'Manual peeling S1 - LiÃªn', 'Manual peeling S1 thá»i vá»¥ - LiÃªn', 'Manual peeling S1 - Dung', 'Manual peeling S1 thá»i vá»¥ - Dung', 'Manual peeling S1 - Loan', 'Manual peeling S1 thá»i vá»¥ - Loan', 'Manual peeling S2 - LiÃªn', 'Manual peeling S2 thá»i vá»¥ - LiÃªn', 'Manual peeling S2 - Dung', 'Manual peeling S2 thá»i vá»¥ - Dung', 'Manual peeling S2 - Loan', 'Manual peeling S2 thá»i vá»¥ - Loan', 'Manual peeling S3 - LiÃªn', 'Manual peeling S3 thá»i vá»¥ - LiÃªn', 'Manual peeling S3 - Dung', 'Manual peeling S3 thá»i vá»¥ - Dung', 'Manual peeling S3 - Loan', 'Manual peeling S3 thá»i vá»¥ - Loan', 'Hand Peeling OT'],
        PACK: ['Packing S1', 'Packing thá»i vá»¥ S1', 'Packing S2', 'Packing thá»i vá»¥ S2', 'Packing S3'],
        BOILER: ['Boiler worker S1', 'Boiler worker S2', 'Boiler worker S3'],
        MAINT_HCA: ['Maintenance S1', 'Maintenance S2', 'Maintenance S3'],
        CLEAN: ['Cleaning worker S1', 'Cleaning worker S2', 'Cleaning worker S3'],
        QC: ['QC S1', 'QC S2', 'QC S3'],
        OFFICE: ['Office S1', 'Office S2', 'Office S3'],
    }

    type ShiftEntry = { deptKey: string; deptName: string; deptCode: string; shift: string; days: Map<string, number>; officialDays: Map<string, number>; seasonalDays: Map<string, number>; otDays: Map<string, number>; dayRowIds: Map<string, string[]> }
    type DeptGroup = { deptKey: string; name: string; code: string; shifts: ShiftEntry[]; sectionRows: SectionRow[] }
    // SectionRow: 1 row per department_name (the Excel "Section" name)
    // dayRowIds: date â†’ list of statsData row IDs (used for direct save without UUID re-lookup)
    type SectionRow = { sectionName: string; deptCode: string; deptKey: string; shift: string; days: Map<string, number>; officialDays: Map<string, number>; seasonalDays: Map<string, number>; dayRowIds: Map<string, string[]>; departmentIds: Set<string> }

    // Build pivot: group by department_name ("Section" in Excel)
    const buildMonthlyPivot = (rows: MealStatRow[]) => {
        // 1. All days in billing cycle (including Sundays / dates with no data)
        const { from, to } = getBillingCycle(statsMonth)
        const days = enumerateDateStrings(from, to)

        // Helper: normalize HPEEL non-canonical section names â†’ canonical SECTION_ORDER name
        const normalizeHpeelSectionName = (name: string, shift: string): string => {
            const n = name.toLowerCase()
            const s = /^[123]$/.test(shift) ? shift : (shift === 'HC' ? '1' : '1')
            const sPrefix = s === 'HC' ? 'HC' : `S${s}`
            // Ms Huá»‡ / Grading / Loan â†’ Manual Grading -Shift N (Ms Huá»‡)
            if (/hu[eá»‡]/i.test(n) || /grading/i.test(n) || /loan/i.test(n)) {
                return `Manual Grading -Shift ${s} (Ms Huá»‡)`
            }
            // LiÃªn â†’ Manual peeling SN - LiÃªn
            if (/li[Ãªáº»en]n/i.test(n)) {
                return `Manual peeling ${sPrefix} - LiÃªn`
            }
            // Dung â†’ Manual peeling SN - Dung
            if (/dung/i.test(n)) {
                return `Manual peeling ${sPrefix} - Dung`
            }
            // Generic hand peeling / manual peeling without supervisor â†’ map to LiÃªn (ca1 default)
            if (/hand.?peel|manual.?peel/i.test(n)) {
                return `Manual peeling ${sPrefix} - LiÃªn`
            }
            return name
        }

        // 2. Map section_name â†’ SectionRow
        const sectionMap = new Map<string, SectionRow>()
        rows.forEach(r => {
            let deptCode = deptList.find(d => d.id === r.department_id)?.code ?? ''
            deptCode = DEPT_CODE_ALIAS[deptCode] ?? deptCode  // merge PEEL_MC â†’ PEEL
            let sectionName = r.department_name   // e.g. "Loading S1", "Shelling S2"
            let shift = r.shift ?? '1'
            // [NOTE] For pivot purposes, ALL HC (HÃ nh chÃ­nh) reports are consolidated into Ca 1
            if (shift === 'HC') shift = '1'
            // Normalize: if sectionName is not a known section for this dept (e.g. kitchen tab saves
            // 'Shelling', 'STEAMING', 'FGWH' instead of canonical 'Shelling S2', 'Steaming S1',
            // 'Loading S1'), derive the proper section name from dept display name + shift
            const knownSections = SECTION_ORDER[deptCode] ?? []
            const isKnownSection = knownSections.some(s => s.toLowerCase() === sectionName.toLowerCase())
            if (!isKnownSection && deptCode) {
                if (deptCode === 'HPEEL') {
                    if (shift === 'OT') {
                        // OT row for HPEEL â€” use canonical 'Hand Peeling OT' name
                        sectionName = 'Hand Peeling OT'
                    } else {
                        // For HPEEL: normalize to canonical section name based on supervisor clues
                        sectionName = normalizeHpeelSectionName(sectionName, shift)
                    }
                } else if (deptCode === 'CS') {
                    // CS uses "Machine Grading - shift N" format (not "Machine Grading SN")
                    sectionName = shift === 'OT' ? 'Machine Grading OT' : `Machine Grading - shift ${shift}`
                } else {
                    const displayName = DEPT_DISPLAY[deptCode] ?? sectionName
                    if (shift === 'OT') {
                        sectionName = `${displayName} OT`
                    } else {
                        sectionName = `${displayName} S${shift}`  // e.g. 'Loading S2', 'Shelling S2'
                    }
                }
            }
            let official = r.official_present ?? 0
            let seasonal = r.seasonal_present ?? 0
            const veg = r.vegetarian ?? 0
            if (official + seasonal < veg) {
                official += veg - (official + seasonal)
            }
            // Total = official + seasonal (vegetarian is a SUBSET of official/seasonal, NOT additive)
            const total = official + seasonal
            const key = `${sectionName}|${shift}`
            const deptKey = (DEPT_CODE_ALIAS[deptCode] ? deptList.find(d => d.code === deptCode)?.id : r.department_id) ?? r.department_id ?? r.department_name
            if (!sectionMap.has(key)) sectionMap.set(key, {
                sectionName, deptCode, deptKey, shift,
                days: new Map(), officialDays: new Map(), seasonalDays: new Map(), dayRowIds: new Map(), departmentIds: new Set()
            })
            const e = sectionMap.get(key)!
            // Track department_id and row ID for direct save (avoids UUID mismatch)
            if (r.department_id) e.departmentIds.add(r.department_id)
            if (!e.dayRowIds.has(r.work_date)) e.dayRowIds.set(r.work_date, [])
            e.dayRowIds.get(r.work_date)!.push(r.id)
            if (total > 0) {
                e.days.set(r.work_date, (e.days.get(r.work_date) ?? 0) + total)
                if ((r.official_present ?? 0) > 0) e.officialDays.set(r.work_date, (e.officialDays.get(r.work_date) ?? 0) + (r.official_present ?? 0))
                if ((r.seasonal_present ?? 0) > 0) e.seasonalDays.set(r.work_date, (e.seasonalDays.get(r.work_date) ?? 0) + (r.seasonal_present ?? 0))
            }
        })

        const shiftMap = new Map<string, ShiftEntry>()
        rows.forEach(r => {
            let deptCode = deptList.find(d => d.id === r.department_id)?.code ?? ''
            deptCode = DEPT_CODE_ALIAS[deptCode] ?? deptCode  // merge PEEL_MC â†’ PEEL
            const deptKey = (DEPT_CODE_ALIAS[deptList.find(d => d.id === r.department_id)?.code ?? ''] ? deptList.find(d => d.code === deptCode)?.id : r.department_id) ?? r.department_id ?? r.department_name
            const deptName = DEPT_DISPLAY[deptCode] ?? r.department_name
            let shift = r.shift ?? '1'
            if (shift === 'HC') shift = '1' // Force HC to merge into Shift 1
            const groupKey = deptCode || deptKey
            const mapKey = `${groupKey}|${shift}`
            if (!shiftMap.has(mapKey)) shiftMap.set(mapKey, { deptKey: groupKey, deptName, deptCode, shift, days: new Map(), officialDays: new Map(), seasonalDays: new Map(), otDays: new Map(), dayRowIds: new Map() })
            const entry = shiftMap.get(mapKey)!
            // Track row IDs for direct save
            if (!entry.dayRowIds.has(r.work_date)) entry.dayRowIds.set(r.work_date, [])
            entry.dayRowIds.get(r.work_date)!.push(r.id)
            let off = r.official_present ?? 0
            let sea = r.seasonal_present ?? 0
            const v = r.vegetarian ?? 0
            if (off + sea < v) off += v - (off + sea)

            // Total = official + seasonal (vegetarian is subset, NOT additive)
            const count = off + sea
            if (count > 0) entry.days.set(r.work_date, (entry.days.get(r.work_date) ?? 0) + count)
            if (off > 0) entry.officialDays.set(r.work_date, (entry.officialDays.get(r.work_date) ?? 0) + off)
            if (sea > 0) entry.seasonalDays.set(r.work_date, (entry.seasonalDays.get(r.work_date) ?? 0) + sea)
            // Route ot_count to a synthetic OT shift entry for this dept
            // (kitchen tab records store OT workers in ot_count alongside regular shifts)
            const otTotal = (r.ot_count ?? 0) + (r.ot_vegetarian ?? 0)
            if (otTotal > 0 && shift !== 'OT') {
                const groupKey = deptCode || deptKey
                const otMapKey = `${groupKey}|OT`
                if (!shiftMap.has(otMapKey)) shiftMap.set(otMapKey, { deptKey: groupKey, deptName, deptCode, shift: 'OT', days: new Map(), officialDays: new Map(), seasonalDays: new Map(), otDays: new Map(), dayRowIds: new Map() })
                const otEntry = shiftMap.get(otMapKey)!
                otEntry.days.set(r.work_date, (otEntry.days.get(r.work_date) ?? 0) + otTotal)
                // Track which row has OT for this date
                if (!otEntry.dayRowIds.has(r.work_date)) otEntry.dayRowIds.set(r.work_date, [])
                otEntry.dayRowIds.get(r.work_date)!.push(r.id)
            }
        })

        // 4. Build dept groups
        const deptGroupMap = new Map<string, DeptGroup>()
        shiftMap.forEach(se => {
            const displayName = DEPT_DISPLAY[se.deptCode] ?? se.deptName
            if (!deptGroupMap.has(se.deptCode || se.deptKey)) deptGroupMap.set(se.deptCode || se.deptKey, { deptKey: se.deptKey, name: displayName, code: se.deptCode, shifts: [], sectionRows: [] })
            deptGroupMap.get(se.deptCode || se.deptKey)!.shifts.push(se)
        })
        // Attach section rows to dept groups
        sectionMap.forEach(sr => {
            const keyToFind = sr.deptCode || sr.sectionName
            // Try to find the group by code first, then by matching the name
            const dg = deptGroupMap.get(keyToFind) ?? [...deptGroupMap.values()].find(g => (g.code && g.code === sr.deptCode) || (!g.code && g.name === sr.sectionName))
            if (dg && !dg.sectionRows.find(s => s.sectionName === sr.sectionName && s.shift === sr.shift)) {
                dg.sectionRows.push(sr)
            }
        })
        deptGroupMap.forEach(dg => {
            dg.shifts.sort((a, b) => {
                const ai = SHIFT_ORDER.indexOf(a.shift); const bi = SHIFT_ORDER.indexOf(b.shift)
                return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi)
            })
            // Sort section rows by SECTION_ORDER
            const order = SECTION_ORDER[dg.code] ?? []
            dg.sectionRows.sort((a, b) => {
                const ai = order.indexOf(a.sectionName); const bi = order.indexOf(b.sectionName)
                return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi)
            })
        })
        const deptGroups = [...deptGroupMap.values()].sort((a, b) => {
            const ai = DEPT_ORDER.indexOf(a.code); const bi = DEPT_ORDER.indexOf(b.code)
            if (ai < 0 && bi < 0) return a.name.localeCompare(b.name)
            if (ai < 0) return 1; if (bi < 0) return -1
            return ai - bi
        })
        return { days, deptGroups, sectionMap }
    }

    const exportMonthlyExcel = () => {
        if (!statsData || statsData.length === 0) return
        const { days, deptGroups } = buildMonthlyPivot(statsData)
        // Title rows like excel
        const billingLabel = getBillingCycle(statsMonth).label
        const titleRow = [`TIá»€N CÆ M CÃN Bá»˜ CÃ”NG NHÃ‚N VIÃŠN THÃNG ${statsMonth}`]
        const periodRow = [`Tá»« ngÃ y ${billingLabel}`]
        const header = ["Section", ...days.map(d => parseInt(d.slice(8), 10)), "Total"]
        const dataRows: (string | number)[][] = []
        deptGroups.forEach(dept => {
            dept.sectionRows.forEach(sr => {
                const rowTotal = [...sr.days.values()].reduce((a, b) => a + b, 0)
                dataRows.push([sr.sectionName, ...days.map(d => sr.days.get(d) ?? ''), rowTotal || ''])
            })
            // OT row within group
            const otShift = dept.shifts.find(s => s.shift === 'OT')
            if (otShift) {
                const otTotal = [...otShift.days.values()].reduce((a, b) => a + b, 0)
                if (otTotal > 0) dataRows.push(['OT', ...days.map(d => otShift.days.get(d) ?? ''), otTotal])
            }
        })
        // Footer rows
        const totalRow = ['Total', ...days.map(d => deptGroups.reduce((s, dg) => s + dg.sectionRows.filter(sr => sr.shift !== 'OT').reduce((ss, sr) => ss + (sr.days.get(d) ?? 0), 0) + (dg.shifts.find(sh => sh.shift === 'OT')?.days.get(d) ?? 0), 0)),
            deptGroups.reduce((s, dg) => s + dg.sectionRows.filter(sr => sr.shift !== 'OT').reduce((ss, sr) => ss + [...sr.days.values()].reduce((a, b) => a + b, 0), 0) + (dg.shifts.find(sh => sh.shift === 'OT') ? [...dg.shifts.find(sh => sh.shift === 'OT')!.days.values()].reduce((a, b) => a + b, 0) : 0), 0)]
        const ca1Row = ['Ca 1:', ...days.map(d => deptGroups.reduce((s, dg) => s + dg.sectionRows.filter(sr => sr.shift === '1').reduce((ss, sr) => ss + (sr.days.get(d) ?? 0), 0), 0)),
            deptGroups.reduce((s, dg) => s + dg.sectionRows.filter(sr => sr.shift === '1').reduce((ss, sr) => ss + [...sr.days.values()].reduce((a, b) => a + b, 0), 0), 0)]
        const ca2Row = ['Ca 2:', ...days.map(d => deptGroups.reduce((s, dg) => s + dg.sectionRows.filter(sr => sr.shift === '2').reduce((ss, sr) => ss + (sr.days.get(d) ?? 0), 0), 0)),
            deptGroups.reduce((s, dg) => s + dg.sectionRows.filter(sr => sr.shift === '2').reduce((ss, sr) => ss + [...sr.days.values()].reduce((a, b) => a + b, 0), 0), 0)]
        const ca3Row = ['Ca 3:', ...days.map(d => deptGroups.reduce((s, dg) => s + dg.sectionRows.filter(sr => sr.shift === '3').reduce((ss, sr) => ss + (sr.days.get(d) ?? 0), 0), 0)),
            deptGroups.reduce((s, dg) => s + dg.sectionRows.filter(sr => sr.shift === '3').reduce((ss, sr) => ss + [...sr.days.values()].reduce((a, b) => a + b, 0), 0), 0)]
        const hcRow = ['Ca HC:', ...days.map(d => deptGroups.reduce((s, dg) => s + dg.sectionRows.filter(sr => sr.shift === 'HC').reduce((ss, sr) => ss + (sr.days.get(d) ?? 0), 0), 0)),
            deptGroups.reduce((s, dg) => s + dg.sectionRows.filter(sr => sr.shift === 'HC').reduce((ss, sr) => ss + [...sr.days.values()].reduce((a, b) => a + b, 0), 0), 0)]
        const otRow = ['OT', ...days.map(d => deptGroups.reduce((s, dg) => s + (dg.shifts.find(sh => sh.shift === 'OT')?.days.get(d) ?? 0), 0)),
            deptGroups.reduce((s, dg) => s + (dg.shifts.find(sh => sh.shift === 'OT') ? [...dg.shifts.find(sh => sh.shift === 'OT')!.days.values()].reduce((a, b) => a + b, 0) : 0), 0)]
        const tvRow = ['Thá»i vá»¥', ...days.map(d => deptGroups.reduce((s, dg) => s + dg.sectionRows.reduce((ss, sr) => ss + (sr.seasonalDays.get(d) ?? 0), 0), 0)),
            deptGroups.reduce((s, dg) => s + dg.sectionRows.reduce((ss, sr) => ss + [...sr.seasonalDays.values()].reduce((a, b) => a + b, 0), 0), 0)]
        const ctRow = ['ChÃ­nh thá»©c', ...days.map(d => deptGroups.reduce((s, dg) => s + dg.sectionRows.reduce((ss, sr) => ss + (sr.officialDays.get(d) ?? 0), 0), 0)),
            deptGroups.reduce((s, dg) => s + dg.sectionRows.reduce((ss, sr) => ss + [...sr.officialDays.values()].reduce((a, b) => a + b, 0), 0), 0)]
        const wsData = [titleRow, periodRow, header, ...dataRows, totalRow, ca1Row, ca2Row, ca3Row, hcRow, otRow, tvRow, ctRow]
        const ws = XLSX.utils.aoa_to_sheet(wsData)
        ws["!cols"] = [{ wch: 32 }, ...days.map(() => ({ wch: 5 })), { wch: 8 }]
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, `CÆ¡m ${statsMonth}`)
        XLSX.writeFile(wb, `bao-com-${statsMonth}.xlsx`)
    }

    // â”€â”€â”€ DB-based summary state (Chi tiáº¿t tá»«ng ca) â”€â”€â”€
    const [summaryDate, setSummaryDate] = useState<string>(new Date().toISOString().slice(0, 10))  // default: hÃ´m nay
    const [summaryShift, setSummaryShift] = useState<string>("1")
    const [summaryLoading, setSummaryLoading] = useState(false)
    const [summaryData, setSummaryData] = useState<SavedRecord[] | null>(null)
    const [summaryError, setSummaryError] = useState<string | null>(null)
    // Edit state
    const [editingRowId, setEditingRowId] = useState<string | null>(null)
    const [editFields, setEditFields] = useState<{ official_present: number; seasonal_present: number; vegetarian: number; ot_count: number; ot_vegetarian: number }>({ official_present: 0, seasonal_present: 0, vegetarian: 0, ot_count: 0, ot_vegetarian: 0 })
    // Add-row state
    const [addRow, setAddRow] = useState<{ deptId: string; officialPresent: number; seasonalPresent: number; vegetarian: number; otCount: number } | null>(null)

    // â”€â”€â”€ Daily summary state (Chá»‘t sá»‘ gá»­i nhÃ  Äƒn) â”€â”€â”€
    // CÃ³ thá»ƒ chá»n ngÃ y, default hÃ´m nay
    const [dailyDate, setDailyDate] = useState<string>(() => {
        const d = new Date()
        return d.toISOString().slice(0, 10)
    })
    const [dailyLoading, setDailyLoading] = useState(false)
    const [dailyMsg, setDailyMsg] = useState<string | null>(null)
    const [dailyError, setDailyError] = useState<string | null>(null)
    const [copiedDaily, setCopiedDaily] = useState(false)

    const fetchDailySummary = async () => {
        setDailyLoading(true)
        setDailyError(null)
        setDailyMsg(null)
        try {
            const { data, error } = await supabase
                .from("meal_headcount")
                .select("shift, official_present, seasonal_present, ot_count, vegetarian, ot_vegetarian, note")
                .eq("work_date", dailyDate)
            if (error) throw error
            const rows = (data ?? []) as { shift: string; official_present: number; seasonal_present: number; ot_count: number; vegetarian: number; ot_vegetarian: number; note: string | null }[]

            // Map HC directly to 1 globally for the daily summary computation
            rows.forEach(r => { if (r.shift === 'HC') r.shift = '1' })

            // Tá»•ng theo tá»«ng ca
            const ca1 = rows.filter(r => r.shift === '1').reduce((s, r) => s + Math.max((r.official_present ?? 0) + (r.seasonal_present ?? 0), r.vegetarian ?? 0), 0)
            const ca2 = rows.filter(r => r.shift === '2').reduce((s, r) => s + Math.max((r.official_present ?? 0) + (r.seasonal_present ?? 0), r.vegetarian ?? 0), 0)
            const ca3 = rows.filter(r => r.shift === '3').reduce((s, r) => s + Math.max((r.official_present ?? 0) + (r.seasonal_present ?? 0), r.vegetarian ?? 0), 0)

            // Analyze OT grouped by specifically matched times
            const otGroups = new Map<string, { man: number, chay: number }>()

            rows.forEach(r => {
                const isOtShift = r.shift === 'OT'

                let man = (r.ot_count ?? 0)
                let chay = (r.ot_vegetarian ?? 0)

                if (isOtShift) {
                    const shiftTotal = Math.max((r.official_present ?? 0) + (r.seasonal_present ?? 0), r.vegetarian ?? 0)
                    const shiftVeg = r.vegetarian ?? 0
                    const shiftMan = Math.max(0, shiftTotal - shiftVeg)

                    man += shiftMan
                    chay += shiftVeg
                }

                if (man > 0 || chay > 0) {
                    const timeMatch = r.note?.match(/Giá» Äƒn OT:\s*([0-9]{2}:[0-9]{2}|[0-9]{1,2}h(?:[0-9]{2})?)/i)
                    const time = timeMatch ? timeMatch[1] : "KhÃ´ng bÃ¡o giá»"
                    if (!otGroups.has(time)) otGroups.set(time, { man: 0, chay: 0 })
                    const group = otGroups.get(time)!
                    group.man += man
                    group.chay += chay
                }
            })

            const totalOT = Array.from(otGroups.values()).reduce((sum, g) => sum + g.man + g.chay, 0)
            const grand = ca1 + ca2 + ca3 + totalOT
            const dateDisplay = format(parseISO(dailyDate), "d/M/yyyy")

            let msg = `NgÃ y ${dateDisplay}\n`
            if (ca1 > 0) msg += `Ca 1: ${ca1}\n`
            if (ca2 > 0) msg += `Ca 2: ${ca2}\n`
            if (ca3 > 0) msg += `Ca 3: ${ca3}\n`

            if (totalOT > 0) {
                msg += `OT: ${totalOT}\n`
            }

            msg += `Tá»•ng: ${grand}`
            if (grand === 0) {
                setDailyError("âš ï¸ KhÃ´ng cÃ³ dá»¯ liá»‡u cho ngÃ y " + dateDisplay + " â€” hÃ£y kiá»ƒm tra láº¡i.")
            } else {
                setDailyMsg(msg)
            }
        } catch (e: unknown) {
            setDailyError(e instanceof Error ? e.message : String(e))
        } finally {
            setDailyLoading(false)
        }
    }

    const fetchSummaryFromDB = async () => {
        setSummaryLoading(true)
        setSummaryError(null)
        setSummaryData(null)
        setEditingRowId(null)
        setAddRow(null)
        try {
            const shiftFilter = summaryShift === "1" ? ["1", "HC"] : [summaryShift]
            const { data, error } = await supabase
                .from("meal_headcount")
                .select("*")
                .eq("work_date", summaryDate)
                .in("shift", shiftFilter)
                .order("department_name")
            if (error) throw error
            // Aggregate: sum up all sub-section records that share the same department_id
            // (e.g. HPEEL has both "Manual Grading -Shift 1 (Ms Huá»‡)" AND "Manual peeling S1 - Dung"
            //  â€” they must be SUMMED, not deduped)
            const aggMap = new Map<string, SavedRecord>()
                ; (data ?? []).forEach(r => {
                    const key = r.department_id ?? r.department_name
                    if (!aggMap.has(key)) {
                        // Clone first record as the base
                        aggMap.set(key, { ...r })
                    } else {
                        // Sum numeric fields into the base record
                        const base = aggMap.get(key)!
                        base.official_present = (base.official_present ?? 0) + (r.official_present ?? 0)
                        base.official_absent = (base.official_absent ?? 0) + (r.official_absent ?? 0)
                        base.seasonal_present = (base.seasonal_present ?? 0) + (r.seasonal_present ?? 0)
                        base.seasonal_absent = (base.seasonal_absent ?? 0) + (r.seasonal_absent ?? 0)
                        base.vegetarian = (base.vegetarian ?? 0) + (r.vegetarian ?? 0)
                        base.ot_count = (base.ot_count ?? 0) + (r.ot_count ?? 0)
                        base.ot_vegetarian = (base.ot_vegetarian ?? 0) + (r.ot_vegetarian ?? 0)
                    }
                })
            setSummaryData([...aggMap.values()].sort((a, b) => a.department_name.localeCompare(b.department_name)))

        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e)
            setSummaryError(msg || "Lá»—i khÃ´ng xÃ¡c Ä‘á»‹nh")
        } finally {
            setSummaryLoading(false)
        }
    }

    const handleDeleteRow = async (id: string) => {
        if (!confirm("Äá»“ng Ã½ xÃ³a báº£n ghi nÃ y?")) return
        const res = await fetch(`/api/meal-headcount?id=${id}`, { method: 'DELETE' })
        const json = await res.json()
        if (!res.ok) {
            alert("Lá»—i xÃ³a: " + (json.error || res.statusText))
            return
        }
        // XÃ³a luÃ´n trong historyRecords (state local)
        setHistoryRecords(prev => prev.filter(r => r.id !== id))
        setHistoryRefreshKey(k => k + 1)
        // Re-fetch tá»« DB Ä‘á»ƒ Ä‘áº£m báº£o khÃ´ng cÃ³ báº£n ghi trÃ¹ng cÅ© hiá»‡n láº¡i
        await fetchSummaryFromDB()
    }

    const handleStartEdit = (r: SavedRecord) => {
        setEditingRowId(r.id)
        setEditFields({ official_present: r.official_present ?? 0, seasonal_present: r.seasonal_present ?? 0, vegetarian: r.vegetarian ?? 0, ot_count: r.ot_count ?? 0, ot_vegetarian: r.ot_vegetarian ?? 0 })
    }

    const handleSaveEdit = async (id: string) => {
        // Gá»i server-side API Ä‘á»ƒ bypass RLS (service role key)
        // Server váº«n verify role cá»§a user trÆ°á»›c khi update
        const res = await fetch('/api/meal-headcount', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id,
                official_present: editFields.official_present,
                seasonal_present: editFields.seasonal_present,
                vegetarian: editFields.vegetarian,
                ot_count: editFields.ot_count,
                ot_vegetarian: editFields.ot_vegetarian,
            })
        })
        const json = await res.json()
        if (!res.ok) {
            alert('Lá»—i lÆ°u: ' + (json.error || res.statusText))
            return
        }
        setEditingRowId(null)
        // Re-fetch Ä‘á»ƒ hiá»ƒn thá»‹ Ä‘Ãºng data tá»« DB
        await fetchSummaryFromDB()
        setHistoryRefreshKey(k => k + 1)
    }

    const handleAddRowSave = async () => {
        if (!addRow || !addRow.deptId) return
        const dept = deptList.find(d => d.id === addRow.deptId)
        if (!dept) return
        const { data: { user } } = await supabase.auth.getUser()
        const payload = {
            work_date: summaryDate,
            department_name: dept.name_en,
            department_id: dept.id,
            shift: summaryShift,
            official_present: addRow.officialPresent,
            official_absent: 0,
            seasonal_present: addRow.seasonalPresent,
            seasonal_absent: 0,
            ot_count: addRow.otCount,
            vegetarian: addRow.vegetarian,
            note: null,
            created_by: user?.id,
            updated_at: new Date().toISOString(),
        }

        const res = await fetch('/api/meal-headcount', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        const json = await res.json()

        if (res.ok) {
            setAddRow(null)
            await fetchSummaryFromDB()
            // Äá»“ng bá»™: Ä‘Ã¡nh dáº¥u Ä‘á»ƒ re-fetch lá»‹ch sá»­ khi chuyá»ƒn tab
            setHistoryRefreshKey(k => k + 1)
        } else {
            alert("Lá»—i lÆ°u: " + (json.error || res.statusText))
        }
    }

    const buildDBSummaryText = (rows: SavedRecord[]): string => {
        const totalPresent = rows.reduce((s, r) => s + Math.max((r.official_present ?? 0) + (r.seasonal_present ?? 0), r.vegetarian ?? 0), 0)
        const totalVeg = rows.reduce((s, r) => s + (r.vegetarian ?? 0), 0)
        const man = Math.max(0, totalPresent - totalVeg)

        // Analyze OT grouped by specifically matched times
        const otGroups = new Map<string, { man: number, chay: number }>()

        rows.forEach(r => {
            const isOtShift = r.shift === 'OT'
            let manOt = (r.ot_count ?? 0)
            let chayOt = (r.ot_vegetarian ?? 0)

            if (isOtShift) {
                const shiftTotal = Math.max((r.official_present ?? 0) + (r.seasonal_present ?? 0), r.vegetarian ?? 0)
                const shiftVeg = r.vegetarian ?? 0
                const shiftMan = Math.max(0, shiftTotal - shiftVeg)
                manOt += shiftMan
                chayOt += shiftVeg
            }

            if (manOt > 0 || chayOt > 0) {
                const timeMatch = r.note?.match(/Giá» Äƒn OT:\s*([0-9]{2}:[0-9]{2}|[0-9]{1,2}h(?:[0-9]{2})?)/i)
                const time = timeMatch ? timeMatch[1] : "KhÃ´ng bÃ¡o giá»"
                if (!otGroups.has(time)) otGroups.set(time, { man: 0, chay: 0 })
                const group = otGroups.get(time)!
                group.man += manOt
                group.chay += chayOt
            }
        })

        const totalOT = Array.from(otGroups.values()).reduce((sum, g) => sum + g.man + g.chay, 0)
        const dateDisplay = format(parseISO(summaryDate), "d/M/yyyy")

        let msg = `NgÃ y ${dateDisplay}\nCa ${summaryShift} cÃ³ tá»•ng cá»™ng ${totalPresent} pháº§n, trong Ä‘Ã³ sá»‘ pháº§n máº·n lÃ  ${man}; sá»‘ pháº§n chay lÃ  ${totalVeg}`

        if (totalOT > 0) {
            msg += `\nOT: ${totalOT}\n`
            const sortedTimes = Array.from(otGroups.keys()).sort((a, b) => {
                if (a === "KhÃ´ng bÃ¡o giá»") return 1
                if (b === "KhÃ´ng bÃ¡o giá»") return -1
                return a.localeCompare(b)
            })

            for (const time of sortedTimes) {
                const g = otGroups.get(time)!
                const groupTotal = g.man + g.chay
                if (g.chay > 0) {
                    msg += `  - LÃºc ${time}: ${groupTotal} pháº§n (${g.man} máº·n, ${g.chay} chay)\n`
                } else {
                    msg += `  - LÃºc ${time}: ${groupTotal} pháº§n\n`
                }
            }
        }

        return msg.trim()
    }

    const getDBMissingDepts = (rows: SavedRecord[], shift: string): { code: string; name: string }[] => {
        // PEEL_MC is an alias for PEEL â€” treat them as the same dept for missing-check
        const DEPT_MISSING_ALIAS: Record<string, string> = { PEEL_MC: 'PEEL' }
        const reported = new Set(rows.map(r => {
            const code = r.department_id
                ? (deptList.find(d => d.id === r.department_id)?.code ?? "")
                : ""
            return DEPT_MISSING_ALIAS[code] ?? code
        }))
        // For Ca 2 and Ca 3, FGWH and OFFICE don't operate â€” skip them
        const effectiveDepts = shift === '1'
            ? EXPECTED_DEPTS
            : EXPECTED_DEPTS.filter(code => !CA1_ONLY_DEPTS.has(code))
        return effectiveDepts
            .filter(code => !reported.has(code))
            .map(code => {
                const dept = deptList.find(d => d.code === code)
                return { code, name: dept?.name_en ?? code }
            })
    }

    // â”€â”€â”€ Parse handlers â”€â”€â”€
    const [aiParsing, setAiParsing] = useState(false)
    const [aiError, setAiError] = useState<string | null>(null)
    const [aiTruncated, setAiTruncated] = useState(false)
    const [confirmedRows, setConfirmedRows] = useState<Set<number>>(new Set())
    const [expandedSource, setExpandedSource] = useState<Set<number>>(new Set())
    const [confirmingRow, setConfirmingRow] = useState<number | null>(null)
    const [confirmMsg, setConfirmMsg] = useState<Record<number, { type: 'ok' | 'err'; text: string }>>({})
    // â”€â”€ Overwrite confirmation modal â”€â”€
    // Used by both single-row confirm and bulk save
    const [overwriteModal, setOverwriteModal] = useState<{
        title: string
        lines: string[]
        onConfirm: () => void
        onCancel: () => void
    } | null>(null)
    // Inline editing state
    const [editingCell, setEditingCell] = useState<{ row: number; field: string } | null>(null)
    const [editDraft, setEditDraft] = useState('')

    const toggleSource = (i: number) =>
        setExpandedSource(prev => { const s = new Set(prev); s.has(i) ? s.delete(i) : s.add(i); return s })

    const updateRecord = (row: number, field: string, val: number | string | null) =>
        setRecords(prev => prev.map((r, idx) => idx === row ? { ...r, [field]: val } : r))

    const commitEdit = (row: number, field: string) => {
        if (field === 'ot') updateRecord(row, 'ot', editDraft)
        else updateRecord(row, field, editDraft === '' ? null : Number(editDraft))
        setEditingCell(null)
    }

    const handleConfirmOne = async (i: number) => {
        if (!canSave) return
        const r = records[i]
        setConfirmingRow(i)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            const deptId = getEffectiveDeptId(r, i)
            const _area = getEffectiveArea(r, i)
            const canonicalName = getCanonicalDeptName(r, i, deptId)
            const workDate = dateToISO(r.date)
            const shift = r.shift.replace(/[^1-3]/g, '') || '1'

            // â”€â”€ Check náº¿u data Ä‘Ã£ tá»“n táº¡i â”€â”€
            const { data: existing } = await supabase
                .from('meal_headcount')
                .select('id, official_present, seasonal_present, vegetarian, ot_count')
                .eq('work_date', workDate)
                .eq('department_name', canonicalName)
                .eq('shift', shift)
                .maybeSingle()

            if (existing) {
                const existSummary = `CT: ${existing.official_present ?? 0}, TV: ${existing.seasonal_present ?? 0}, Chay: ${existing.vegetarian ?? 0}, OT: ${existing.ot_count ?? 0}`
                // Hiá»‡n modal xÃ¡c nháº­n thay vÃ¬ window.confirm
                await new Promise<void>((resolve, reject) => {
                    setOverwriteModal({
                        title: 'âš ï¸ Dá»¯ liá»‡u Ä‘Ã£ tá»“n táº¡i',
                        lines: [
                            `ðŸ“… NgÃ y: ${workDate}`,
                            `ðŸ­ Bá»™ pháº­n: ${canonicalName}  |  Ca ${shift}`,
                            `ðŸ“Š Dá»¯ liá»‡u hiá»‡n táº¡i: ${existSummary}`,
                            '',
                            'Báº¡n cÃ³ muá»‘n ghi Ä‘Ã¨ dá»¯ liá»‡u cÅ© khÃ´ng?',
                        ],
                        onConfirm: () => { setOverwriteModal(null); resolve() },
                        onCancel: () => {
                            setOverwriteModal(null)
                            setConfirmMsg(prev => ({ ...prev, [i]: { type: 'err', text: 'â­ Bá» qua (Ä‘Ã£ cÃ³ data)' } }))
                            setConfirmingRow(null)
                            reject(new Error('cancelled'))
                        },
                    })
                })  // Náº¿u reject('cancelled'), catch bÃªn ngoÃ i sáº½ báº¯t vÃ  return â€” khÃ´ng lÆ°u
            }

            const { otCount, otVegetarian } = parseOTString(r.ot)
            const payload = {
                work_date: workDate,
                department_name: canonicalName,
                department_id: deptId,
                shift,
                official_present: r.officialPresent ?? 0,
                official_absent: r.officialAbsent ?? 0,
                seasonal_present: r.seasonalPresent ?? 0,
                seasonal_absent: r.seasonalAbsent ?? 0,
                ot_count: otCount,
                ot_vegetarian: otVegetarian,
                vegetarian: r.vegetarian ?? 0,
                note: null,
                created_by: user?.id,
                updated_at: new Date().toISOString(),
            }
            const res = await fetch('/api/meal-headcount', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error || res.statusText)

            setConfirmedRows(prev => new Set([...prev, i]))
            setConfirmMsg(prev => ({ ...prev, [i]: { type: 'ok', text: existing ? 'âœ“ ÄÃ£ ghi Ä‘Ã¨' : 'âœ“ ÄÃ£ lÆ°u' } }))
        } catch (e) {
            // 'cancelled' = user báº¥m Há»§y á»Ÿ modal â€” khÃ´ng hiá»‡n lá»—i (confirmMsg Ä‘Ã£ Ä‘Æ°á»£c set trong onCancel)
            if (e instanceof Error && e.message === 'cancelled') {
                setConfirmingRow(null)
                return
            }
            setConfirmMsg(prev => ({ ...prev, [i]: { type: 'err', text: 'âŒ ' + (e instanceof Error ? e.message : String(e)) } }))
        } finally {
            setConfirmingRow(null)
        }
    }

    const handleParse = useCallback(() => {
        if (!rawText.trim()) return
        const result = parseZaloText(rawText)
        setRecords(result)
        setParsed(true)
        setSaveMsg(null)
        setAiError(null)
    }, [rawText])

    const handleAIParse = useCallback(async () => {
        if (!rawText.trim()) return
        setAiParsing(true)
        setAiError(null)
        try {
            const res = await fetch('/api/parse-meal-ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: rawText }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)

            // Map AI response â†’ HeadcountRecord[]
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const aiRecords: HeadcountRecord[] = (json.records as any[]).map((r: any) => ({
                senderHint: r.senderHint ?? '',
                date: r.date ?? '',
                area: r.area ?? '',
                shift: String(r.shift ?? '1'),
                officialPresent: r.officialPresent != null ? Number(r.officialPresent) : null,
                officialPresentNote: r.officialPresentNote ?? '',
                officialAbsent: r.officialAbsent != null ? Number(r.officialAbsent) : null,
                seasonalPresent: r.seasonalPresent != null ? Number(r.seasonalPresent) : null,
                seasonalAbsent: r.seasonalAbsent != null ? Number(r.seasonalAbsent) : null,
                ot: String(r.ot ?? ''),
                vegetarian: r.vegetarian != null ? Number(r.vegetarian) : null,
                raw: rawText,   // Always show full pasted text as source
            }))
            setRecords(deduplicateRecords(aiRecords))
            setParsed(true)
            setSaveMsg(null)
            setAiTruncated(!!json.truncated)
            // Náº¿u AI khÃ´ng parse Ä‘Æ°á»£c â†’ hiá»‡n warning thay vÃ¬ crash
            if (json.warning) {
                setAiError(json.warning)
            }
        } catch (e) {
            setAiError(e instanceof Error ? e.message : String(e))
        } finally {
            setAiParsing(false)
        }
    }, [rawText])

    const handleReset = () => {
        setRawText("")
        setRecords([])
        setParsed(false)
        setSaveMsg(null)
        setConfirmedRows(new Set())
        setExpandedSource(new Set())
        setConfirmMsg({})
    }

    const handleCopyTable = () => {
        if (records.length === 0) return
        const headers = ["NgÃ y", "Khu vá»±c", "Ca", "CT Hiá»‡n diá»‡n", "CT Váº¯ng", "TV Hiá»‡n diá»‡n", "TV Váº¯ng", "OT", "Chay"]
        const rows = records.map((r) =>
            [r.date, r.area, r.shift, r.officialPresent ?? "", r.officialAbsent ?? "", r.seasonalPresent ?? "", r.seasonalAbsent ?? "", r.ot, r.vegetarian ?? ""].join("\t")
        )
        navigator.clipboard.writeText([headers.join("\t"), ...rows].join("\n"))
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    // â”€â”€â”€ Save to DB â”€â”€â”€
    const findDeptId = (areaName: string): string | null => {
        const lower = areaName.toLowerCase().trim()
        // 1. Try DEPT_MAP (display/alias text â†’ code)
        const code = DEPT_MAP[lower]
        if (code) {
            // HPEEL sub-groups all resolve to HPEEL dept_id
            const resolvedCode = HPEEL_SUBCODES.has(code) ? 'HPEEL' : code
            const dept = deptList.find((d) => d.code === resolvedCode)
            if (dept) return dept.id
        }
        // 2. Fallback: AI may return the DB code directly (e.g. "STEAM", "HPEEL", "MAINT_SHELL")
        const upperDirect = areaName.toUpperCase().trim()
        if (HPEEL_SUBCODES.has(upperDirect)) { return deptList.find((d) => d.code === 'HPEEL')?.id || null }
        const deptDirect = deptList.find((d) => d.code === upperDirect)
        return deptDirect?.id || null
    }

    // â”€â”€â”€ Shift-aware canonical department name for DB â”€â”€â”€
    const getCanonicalDeptName = (r: HeadcountRecord, i: number, deptId: string | null): string => {
        const _area = getEffectiveArea(r, i)
        const lower = _area.toLowerCase().trim()
        const shift = r.shift?.replace(/[^1-3]/g, '') || '1'
        const s = /^[123]$/.test(shift) ? shift : '1'
        const isDung = /dung/i.test(lower)
        const isLien = /li[Ãªnáº¿]n/i.test(lower)
        const isHue = /hu[á»‡Ãª]/i.test(lower)
        const isLoan = /loan/i.test(lower)
        // Handpeeling/Manual peeling with supervisor â†’ shift-specific name
        if ((isDung || isLien) && (lower.includes('handpeeling') || lower.includes('manual peeling') || lower.includes('peeling'))) {
            return `Manual peeling S${s} - ${isDung ? 'Dung' : 'LiÃªn'}`
        }
        if ((isHue || isLoan) && (lower.includes('grading') || lower.includes('manual') || lower.includes('loan'))) {
            return `Manual Grading -Shift ${s} (Ms Huá»‡)`
        }
        // Táº­p vá»¥
        if (/t[áº¡á¸¥Ã¢]p\s*v[á»¥u]/i.test(_area)) {
            return deptId ? (deptList.find(d => d.id === deptId)?.name_en ?? 'Cleaning') : 'Cleaning'
        }
        // HPEEL sub-groups
        const _mc = DEPT_MAP[lower]
        if (_mc && HPEEL_SUBCODES.has(_mc)) return HPEEL_SUBGROUP_DISPLAY[_mc] ?? _area
        // Default: DB name_en
        return deptId ? (deptList.find(d => d.id === deptId)?.name_en ?? _area) : _area
    }

    const handleSaveToDB = async () => {
        if (!canSave || records.length === 0) return
        setSaving(true)
        setSaveMsg(null)

        try {
            const { data: { user } } = await supabase.auth.getUser()
            const payload = records.map((r, i) => {
                const deptId = getEffectiveDeptId(r, i)
                const canonicalName = getCanonicalDeptName(r, i, deptId)
                const { otCount, otVegetarian } = parseOTString(r.ot)
                return {
                    work_date: dateToISO(r.date),
                    department_name: canonicalName,
                    department_id: deptId,
                    shift: r.shift.replace(/[^1-3]/g, "") || "1",
                    official_present: r.officialPresent ?? 0,
                    official_absent: r.officialAbsent ?? 0,
                    seasonal_present: r.seasonalPresent ?? 0,
                    seasonal_absent: r.seasonalAbsent ?? 0,
                    ot_count: otCount,
                    ot_vegetarian: otVegetarian,
                    vegetarian: r.vegetarian ?? 0,
                    note: null,
                    created_by: user?.id,
                    updated_at: new Date().toISOString(),
                }
            })

            // â”€â”€ Kiá»ƒm tra ngÃ y Ä‘Ã£ cÃ³ data chÆ°a trÆ°á»›c khi lÆ°u â”€â”€
            const uniqueDatesInPayload = [...new Set(payload.map(p => p.work_date))]
            const { data: existingCheck } = await supabase
                .from('meal_headcount')
                .select('work_date, department_name, shift')
                .in('work_date', uniqueDatesInPayload)

            if (existingCheck && existingCheck.length > 0) {
                // TÃ¬m cÃ¡c báº£n ghi má»›i trÃ¹ng vá»›i báº£n ghi cÅ©
                const overlapping = payload.filter(p =>
                    existingCheck.some(e =>
                        e.work_date === p.work_date &&
                        e.department_name === p.department_name &&
                        e.shift === p.shift
                    )
                )
                if (overlapping.length > 0) {
                    setSaving(false)
                    // NhÃ³m theo ngÃ y Ä‘á»ƒ hiá»ƒn thá»‹ rÃµ rÃ ng
                    const byDate = overlapping.reduce<Record<string, string[]>>((acc, p) => {
                        if (!acc[p.work_date]) acc[p.work_date] = []
                        acc[p.work_date].push(`${p.department_name} Ca ${p.shift}`)
                        return acc
                    }, {})
                    const lines = [
                        `âš ï¸ CÃ³ ${overlapping.length} báº£n ghi sáº½ bá»‹ ghi Ä‘Ã¨:`,
                        '',
                        ...Object.entries(byDate).flatMap(([date, items]) => [
                            `ðŸ“… ${date}:`,
                            ...items.slice(0, 5).map(s => `   â€¢ ${s}`),
                            ...(items.length > 5 ? [`   ... vÃ  ${items.length - 5} báº£n ghi khÃ¡c`] : []),
                        ]),
                        '',
                        'Báº¡n cÃ³ cháº¯c muá»‘n ghi Ä‘Ã¨ táº¥t cáº£ khÃ´ng?',
                    ]
                    await new Promise<void>((resolve, reject) => {
                        setOverwriteModal({
                            title: 'ðŸ”’ XÃ¡c nháº­n ghi Ä‘Ã¨ dá»¯ liá»‡u',
                            lines,
                            onConfirm: () => { setOverwriteModal(null); resolve() },
                            onCancel: () => {
                                setOverwriteModal(null)
                                setSaveMsg({ type: 'err', text: 'â­ ÄÃ£ há»§y â€” khÃ´ng ghi Ä‘Ã¨ dá»¯ liá»‡u cÅ©.' })
                                reject(new Error('cancelled'))
                            },
                        })
                    })
                    setSaving(true)  // tiáº¿p tá»¥c lÆ°u sau khi user xÃ¡c nháº­n
                }
            }

            const res = await fetch('/api/meal-headcount', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error || res.statusText)

            setSaveMsg({ type: "ok", text: `âœ… ÄÃ£ lÆ°u ${payload.length} báº£n ghi thÃ nh cÃ´ng!` })
        } catch (err: unknown) {
            if (err instanceof Error && err.message === 'cancelled') return
            const message = err instanceof Error ? err.message : "Lá»—i khÃ´ng xÃ¡c Ä‘á»‹nh"
            setSaveMsg({ type: "err", text: `âŒ Lá»—i: ${message}` })
        } finally {
            setSaving(false)
        }
    }

    // â”€â”€â”€ History â”€â”€â”€
    const fetchHistory = async () => {
        setHistoryLoading(true)
        const { data, error } = await supabase
            .from("meal_headcount")
            .select("*")
            .gte("work_date", historyFrom)
            .lte("work_date", historyTo)
            .order("work_date", { ascending: false })
            .order("department_name")
            .order("shift")
            .limit(500)

        if (!error && data) setHistoryRecords(data)
        setHistoryLoading(false)
    }

    useEffect(() => {
        if (activeTab === "history") fetchHistory()
    }, [activeTab, historyRefreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

    // Summary stats from parsed records
    const summary = records.reduce(
        (acc, r) => {
            acc.totalOfficial += r.officialPresent ?? 0
            acc.totalAbsent += r.officialAbsent ?? 0
            acc.totalSeasonal += r.seasonalPresent ?? 0
            acc.totalVeg += r.vegetarian ?? 0
            return acc
        },
        { totalOfficial: 0, totalAbsent: 0, totalSeasonal: 0, totalVeg: 0 }
    )

    // History summary
    const historySummary = historyRecords.reduce(
        (acc, r) => {
            acc.totalPresent += r.official_present + r.seasonal_present
            acc.totalAbsent += r.official_absent + r.seasonal_absent
            acc.totalVeg += r.vegetarian
            return acc
        },
        { totalPresent: 0, totalAbsent: 0, totalVeg: 0 }
    )

    const uniqueDates = [...new Set(records.map((r) => r.date).filter(Boolean))]

    return (
        <>
            {/* â”€â”€ Overwrite Confirmation Modal â”€â”€ */}
            {overwriteModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        onClick={overwriteModal.onCancel}
                    />
                    {/* Dialog */}
                    <div className="relative z-10 bg-white rounded-2xl shadow-2xl border-2 border-orange-200 w-full max-w-md mx-4 overflow-hidden">
                        {/* Header */}
                        <div className="bg-gradient-to-r from-orange-500 to-amber-500 px-5 py-4">
                            <h2 className="text-white font-bold text-lg">{overwriteModal.title}</h2>
                        </div>
                        {/* Body */}
                        <div className="px-5 py-4 space-y-1">
                            {overwriteModal.lines.map((line, idx) =>
                                line === '' ? <div key={idx} className="h-2" /> : (
                                    <p
                                        key={idx}
                                        className={
                                            line.startsWith('ðŸ“…') ? 'text-sm font-semibold text-gray-800' :
                                                line.startsWith('ðŸ­') || line.startsWith('ðŸ“Š') ? 'text-sm text-gray-700' :
                                                    line.startsWith('âš ï¸') || line.startsWith('ðŸ”’') ? 'text-sm font-bold text-orange-700' :
                                                        line.startsWith('   â€¢') ? 'text-xs text-gray-600 pl-2' :
                                                            line.startsWith('   ...') ? 'text-xs text-gray-400 pl-2 italic' :
                                                                line.includes('cháº¯c') || line.includes('muá»‘n') ? 'text-sm font-semibold text-red-600 mt-1' :
                                                                    'text-sm text-gray-700'
                                        }
                                    >
                                        {line}
                                    </p>
                                )
                            )}
                        </div>
                        {/* Footer */}
                        <div className="px-5 py-3 bg-gray-50 border-t flex justify-end gap-3">
                            <button type="button"
                                onClick={overwriteModal.onCancel}
                                className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 bg-white border border-gray-300 hover:bg-gray-100 transition-colors"
                            >
                                âŒ Há»§y bá»
                            </button>
                            <button type="button"
                                onClick={overwriteModal.onConfirm}
                                className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-orange-500 hover:bg-orange-600 transition-colors shadow-sm"
                            >
                                âœ… XÃ¡c nháº­n ghi Ä‘Ã¨
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-orange-100 border border-orange-200">
                            <UtensilsCrossed className="h-6 w-6 text-orange-600" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight">Meal Reporting â€” Headcount Tracker</h1>
                            <p className="text-sm text-muted-foreground">
                                Paste Zalo messages Â· Parse Â· Save to DB Â· View history
                            </p>
                        </div>
                    </div>
                </div>

                {/* Tab navigation */}
                <div className="flex border-b">

                    <button type="button"
                        onClick={() => setActiveTab("history")}
                        className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors ${activeTab === "history"
                            ? "border-blue-500 text-blue-600"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                            }`}
                    >
                        <History className="h-4 w-4" />
                        Saved Records
                    </button>
                    <button type="button"
                        onClick={() => setActiveTab("kitchen")}
                        className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors ${activeTab === "kitchen"
                            ? "border-green-500 text-green-600"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                            }`}
                    >
                        <MessageSquare className="h-4 w-4" />
                        ðŸ³ Kitchen Summary
                    </button>
                    <button type="button"
                        onClick={() => setActiveTab("monthly")}
                        className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors ${activeTab === "monthly"
                            ? "border-purple-500 text-purple-600"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                            }`}
                    >
                        <span className="text-base leading-none">ðŸ“…</span>
                        Monthly Report
                    </button>
                    {canEdit && (
                        <button type="button"
                            onClick={() => setActiveTab("ai-chat")}
                            className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors ${activeTab === "ai-chat"
                                ? "border-orange-500 text-orange-600"
                                : "border-transparent text-muted-foreground hover:text-foreground"
                                }`}
                        >
                            <span className="text-base leading-none">ðŸ¤–</span>
                            AI Nháº­p Nhanh
                        </button>
                    )}
                </div>

                {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
                {/* TAB: AI CHAT NHP NHANH                       */}
                {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
                {activeTab === "ai-chat" && canEdit && (
                    <MealAiChat
                        deptList={deptList}
                        onSaveSuccess={() => setHistoryRefreshKey(k => k + 1)}
                    />
                )}

                {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
                {/* TAB 3: KITCHEN / BÃO CÆ M NHÃ€ Ä‚N               */}
                {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
                {activeTab === "kitchen" && (
                    <div className="space-y-5">
                        <div className="flex items-center gap-2 font-semibold text-green-700 text-lg">
                            <MessageSquare className="h-5 w-5" />
                            Tá»•ng há»£p bÃ¡o cÆ¡m nhÃ  Äƒn
                        </div>

                        {/* â”€â”€ CHá»T Sá» Gá»¬I NHÃ€ Ä‚N (táº¥t cáº£ ca trong ngÃ y hÃ´m qua) â”€â”€ */}
                        <div className="bg-gradient-to-br from-orange-50 to-amber-50 border-2 border-orange-200 rounded-xl p-4 space-y-3">
                            <div className="flex items-center gap-2">
                                <Bell className="h-5 w-5 text-orange-500" />
                                <span className="font-bold text-orange-700 text-base">Chá»‘t sá»‘ gá»­i nhÃ  Äƒn</span>
                                <span className="text-xs text-orange-500">(tá»•ng há»£p táº¥t cáº£ ca)</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-4">
                                {/* Date picker cho chá»‘t sá»‘ â€” default hÃ´m qua, cÃ³ thá»ƒ chá»n */}
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-medium text-orange-600">NgÃ y chá»‘t</label>
                                    <input
                                        type="date"
                                        value={dailyDate}
                                        onChange={e => { setDailyDate(e.target.value); setDailyMsg(null) }}
                                        className="border border-orange-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
                                    />
                                </div>
                                <button type="button"
                                    onClick={fetchDailySummary}
                                    disabled={dailyLoading}
                                    className="flex items-center gap-2 px-5 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold transition-all shadow-sm disabled:opacity-50"
                                >
                                    <Bell className="h-4 w-4" />
                                    {dailyLoading ? "Äang tá»•ng há»£p..." : "Tá»•ng há»£p & Chá»‘t sá»‘"}
                                </button>
                            </div>
                            {dailyError && (
                                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{dailyError}</div>
                            )}
                            {dailyMsg && (
                                <div className="bg-white rounded-xl border-2 border-orange-300 shadow-sm p-4">
                                    <div className="text-xs font-semibold text-orange-600 uppercase tracking-wide mb-2">ðŸ“‹ Tin nháº¯n chá»‘t sá»‘ â€” copy gá»­i nhÃ  Äƒn</div>
                                    <pre className="font-mono text-sm whitespace-pre-wrap text-gray-800 leading-relaxed text-base">{dailyMsg}</pre>
                                    <button type="button"
                                        onClick={() => {
                                            navigator.clipboard.writeText(dailyMsg)
                                            setCopiedDaily(true)
                                            setTimeout(() => setCopiedDaily(false), 2000)
                                        }}
                                        className={`mt-3 flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${copiedDaily ? "bg-orange-500 text-white" : "bg-orange-100 hover:bg-orange-200 text-orange-700"
                                            }`}
                                    >
                                        {copiedDaily ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                        {copiedDaily ? "ÄÃ£ copy!" : "Copy tin nháº¯n"}
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* â”€â”€ Chi tiáº¿t theo ca (per-shift) â”€â”€ */}
                        <div className="border-t border-dashed border-green-200 pt-4">
                            <div className="flex items-center gap-2 font-semibold text-green-600 text-sm mb-3">
                                <BarChart3 className="h-4 w-4" />
                                Chi tiáº¿t tá»«ng ca (Ä‘á»ƒ kiá»ƒm tra)
                            </div>

                            {/* Date + Shift selectors */}
                            <div className="flex flex-wrap items-end gap-3 bg-green-50 border border-green-200 rounded-xl p-4">
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-medium text-green-700">NgÃ y</label>
                                    <input
                                        type="date"
                                        value={summaryDate}
                                        onChange={e => setSummaryDate(e.target.value)}
                                        className="border border-green-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
                                    />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-medium text-green-700">Ca</label>
                                    <div className="flex gap-1">
                                        {["1", "2", "3"].map(s => (
                                            <button type="button"
                                                key={s}
                                                onClick={() => setSummaryShift(s)}
                                                className={`px-4 py-1.5 rounded-lg text-sm font-bold border transition-colors ${summaryShift === s
                                                    ? "bg-green-500 text-white border-green-500"
                                                    : "bg-white text-green-700 border-green-300 hover:bg-green-100"
                                                    }`}
                                            >{s}</button>
                                        ))}
                                    </div>
                                </div>
                                <button type="button"
                                    onClick={fetchSummaryFromDB}
                                    disabled={summaryLoading}
                                    className="flex items-center gap-2 px-5 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-bold transition-colors disabled:opacity-50"
                                >
                                    <BarChart3 className="h-4 w-4" />
                                    {summaryLoading ? "Äang táº£i..." : "Tá»•ng há»£p"}
                                </button>
                            </div>
                        </div>

                        {summaryError && (
                            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{summaryError}</div>
                        )}

                        {summaryData !== null && (() => {
                            if (summaryData.length === 0) return (
                                <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                                    âš ï¸ KhÃ´ng cÃ³ dá»¯ liá»‡u cho ngÃ y nÃ y â€” cÃ³ thá»ƒ chÆ°a lÆ°u hoáº·c chÆ°a bÃ¡o Ä‘á»§.
                                </div>
                            )
                            const msgText = buildDBSummaryText(summaryData)
                            const missingDepts = getDBMissingDepts(summaryData, summaryShift)
                            return (
                                <div className="space-y-4">
                                    {/* Kitchen message box */}
                                    <div className="bg-white rounded-xl border-2 border-green-200 shadow-sm p-4">
                                        <div className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-2">Tin nháº¯n gá»­i nhÃ  Äƒn</div>
                                        <pre className="font-mono text-sm whitespace-pre-wrap text-gray-800 leading-relaxed">{msgText}</pre>
                                        <button type="button"
                                            onClick={() => {
                                                navigator.clipboard.writeText(msgText)
                                                setCopiedSummary(true)
                                                setTimeout(() => setCopiedSummary(false), 2000)
                                            }}
                                            className={`mt-3 flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${copiedSummary ? "bg-green-600 text-white" : "bg-green-100 hover:bg-green-200 text-green-700"
                                                }`}
                                        >
                                            {copiedSummary ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                            {copiedSummary ? "ÄÃ£ copy!" : "Copy tin nháº¯n"}
                                        </button>
                                    </div>

                                    {/* Per-dept breakdown */}
                                    <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
                                        <div className="flex items-center justify-between px-4 py-2.5 bg-muted/40 border-b">
                                            <span className="text-sm font-semibold">Chi tiáº¿t tá»«ng bá»™ pháº­n</span>
                                            {canEdit && (
                                                <button type="button"
                                                    onClick={() => setAddRow({ deptId: "", officialPresent: 0, seasonalPresent: 0, vegetarian: 0, otCount: 0 })}
                                                    className="flex items-center gap-1 text-xs font-semibold text-green-700 hover:text-green-900 bg-green-50 border border-green-200 px-2 py-1 rounded-lg transition-colors"
                                                >
                                                    <span className="text-base leading-none">+</span> Add Department
                                                </button>
                                            )}
                                        </div>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm">
                                                <thead>
                                                    <tr className="bg-muted/40 text-xs text-muted-foreground uppercase tracking-wide text-left">
                                                        <th className="px-3 py-2 font-semibold">Bá»™ pháº­n</th>
                                                        <th className="px-3 py-2 font-semibold text-right">ChÃ­nh thá»©c</th>
                                                        <th className="px-3 py-2 font-semibold text-right">Thá»i vá»¥</th>
                                                        <th className="px-3 py-2 font-semibold text-right">Tá»•ng</th>
                                                        <th className="px-3 py-2 font-semibold text-right text-emerald-600">ðŸ¥¦ Chay</th>
                                                        <th className="px-3 py-2 font-semibold text-right">TÄƒng ca</th>
                                                        <th className="px-3 py-2 font-semibold text-right text-emerald-600">ðŸ¥¬ Chay tÄƒng ca</th>
                                                        <th className="px-3 py-2"></th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y">
                                                    {summaryData.map(r => {
                                                        const isEditing = editingRowId === r.id
                                                        const deptName = r.department_id
                                                            ? (deptList.find(d => d.id === r.department_id)?.name_en ?? r.department_name)
                                                            : r.department_name
                                                        return (
                                                            <tr key={r.id} className={isEditing ? "bg-blue-50" : "hover:bg-muted/30"}>
                                                                <td className="px-3 py-2 font-medium whitespace-nowrap">{deptName}</td>
                                                                {isEditing ? (<>
                                                                    <td className="px-1 py-1"><input type="number" min={0} className="w-16 border rounded px-1 py-0.5 text-sm text-right" value={editFields.official_present} onChange={e => setEditFields(f => ({ ...f, official_present: +e.target.value }))} /></td>
                                                                    <td className="px-1 py-1"><input type="number" min={0} className="w-16 border rounded px-1 py-0.5 text-sm text-right" value={editFields.seasonal_present} onChange={e => setEditFields(f => ({ ...f, seasonal_present: +e.target.value }))} /></td>
                                                                    <td className="px-3 py-2 text-right font-bold text-blue-600">{editFields.official_present + editFields.seasonal_present}</td>
                                                                    <td className="px-1 py-1"><input type="number" min={0} className="w-16 border rounded px-1 py-0.5 text-sm text-right text-emerald-700" value={editFields.vegetarian} onChange={e => setEditFields(f => ({ ...f, vegetarian: +e.target.value }))} /></td>
                                                                    <td className="px-1 py-1"><input type="number" min={0} className="w-14 border rounded px-1 py-0.5 text-sm text-right" value={editFields.ot_count} onChange={e => setEditFields(f => ({ ...f, ot_count: +e.target.value }))} /></td>
                                                                    <td className="px-1 py-1"><input type="number" min={0} className="w-14 border rounded px-1 py-0.5 text-sm text-right text-emerald-700" value={editFields.ot_vegetarian} onChange={e => setEditFields(f => ({ ...f, ot_vegetarian: +e.target.value }))} /></td>
                                                                    <td className="px-2 py-1 whitespace-nowrap">
                                                                        <button type="button" onClick={() => handleSaveEdit(r.id)} className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded hover:bg-blue-700 mr-1">LÆ°u</button>
                                                                        <button type="button" onClick={() => setEditingRowId(null)} className="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded hover:bg-gray-300">Há»§y</button>
                                                                    </td>
                                                                </>) : (<>
                                                                    <td className="px-3 py-2 text-right font-semibold text-green-700">{r.official_present ?? 0}</td>
                                                                    <td className="px-3 py-2 text-right">{r.seasonal_present ?? 0}</td>
                                                                    <td className="px-3 py-2 text-right font-bold">{Math.max((r.official_present ?? 0) + (r.seasonal_present ?? 0), r.vegetarian ?? 0)}</td>
                                                                    <td className="px-3 py-2 text-right text-emerald-600 font-semibold">{r.vegetarian ?? 0}</td>
                                                                    <td className="px-3 py-2 text-right font-semibold">{(r.ot_count ?? 0) + (r.ot_vegetarian ?? 0) > 0 ? (r.ot_count ?? 0) + (r.ot_vegetarian ?? 0) : 0}</td>
                                                                    <td className="px-3 py-2 text-right text-emerald-600 font-semibold">{(r.ot_vegetarian ?? 0) > 0 ? r.ot_vegetarian : <span className="text-gray-300">â€”</span>}</td>
                                                                    <td className="px-2 py-2 whitespace-nowrap">
                                                                        {canEdit && (
                                                                            <>
                                                                                <button type="button" onClick={() => handleStartEdit(r)} className="text-xs text-blue-600 hover:underline mr-2">âœï¸ Edit</button>
                                                                                <button type="button" onClick={() => handleDeleteRow(r.id)} className="text-xs text-red-500 hover:underline">ðŸ—‘ Delete</button>
                                                                            </>
                                                                        )}
                                                                    </td>
                                                                </>)}
                                                            </tr>
                                                        )
                                                    })}

                                                    {/* Add-row form */}
                                                    {addRow && (
                                                        <tr className="bg-green-50 border-t-2 border-green-200">
                                                            <td className="px-2 py-1">
                                                                <select
                                                                    className="w-full border border-green-300 rounded px-1 py-0.5 text-sm bg-white"
                                                                    value={addRow.deptId}
                                                                    onChange={e => setAddRow(r => r ? { ...r, deptId: e.target.value } : r)}
                                                                >
                                                                    <option value="">-- Chá»n bá»™ pháº­n --</option>
                                                                    {deptList.map(d => <option key={d.id} value={d.id}>{d.name_en}</option>)}
                                                                </select>
                                                            </td>
                                                            <td className="px-1 py-1"><input type="number" min={0} placeholder="CT" className="w-16 border rounded px-1 py-0.5 text-sm text-right" value={addRow.officialPresent || ""} onChange={e => setAddRow(r => r ? { ...r, officialPresent: +e.target.value } : r)} /></td>
                                                            <td className="px-1 py-1"><input type="number" min={0} placeholder="TV" className="w-16 border rounded px-1 py-0.5 text-sm text-right" value={addRow.seasonalPresent || ""} onChange={e => setAddRow(r => r ? { ...r, seasonalPresent: +e.target.value } : r)} /></td>
                                                            <td className="px-3 py-2 text-right text-muted-foreground text-sm">{(addRow.officialPresent || 0) + (addRow.seasonalPresent || 0)}</td>
                                                            <td className="px-1 py-1"><input type="number" min={0} placeholder="Chay" className="w-16 border rounded px-1 py-0.5 text-sm text-right text-emerald-700" value={addRow.vegetarian || ""} onChange={e => setAddRow(r => r ? { ...r, vegetarian: +e.target.value } : r)} /></td>
                                                            <td className="px-1 py-1"><input type="number" min={0} placeholder="OT" className="w-14 border rounded px-1 py-0.5 text-sm text-right" value={addRow.otCount || ""} onChange={e => setAddRow(r => r ? { ...r, otCount: +e.target.value } : r)} /></td>
                                                            <td className="px-2 py-1 whitespace-nowrap">
                                                                <button type="button" onClick={handleAddRowSave} className="text-xs bg-green-600 text-white px-2 py-0.5 rounded hover:bg-green-700 mr-1">LÆ°u</button>
                                                                <button type="button" onClick={() => setAddRow(null)} className="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded">Há»§y</button>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                                <tfoot>
                                                    <tr className="bg-muted/60 font-bold border-t-2 text-sm">
                                                        <td className="px-3 py-2">Tá»”NG</td>
                                                        <td className="px-3 py-2 text-right text-green-700">{summaryData.reduce((s, r) => s + (r.official_present ?? 0), 0)}</td>
                                                        <td className="px-3 py-2 text-right">{summaryData.reduce((s, r) => s + (r.seasonal_present ?? 0), 0)}</td>
                                                        <td className="px-3 py-2 text-right">{summaryData.reduce((s, r) => s + Math.max((r.official_present ?? 0) + (r.seasonal_present ?? 0), r.vegetarian ?? 0), 0)}</td>
                                                        <td className="px-3 py-2 text-right text-emerald-600">{summaryData.reduce((s, r) => s + (r.vegetarian ?? 0), 0)}</td>
                                                        <td className="px-3 py-2 text-right font-bold">{summaryData.reduce((s, r) => s + (r.ot_count ?? 0) + (r.ot_vegetarian ?? 0), 0)}</td>
                                                        <td className="px-3 py-2 text-right text-emerald-600">{summaryData.reduce((s, r) => s + (r.ot_vegetarian ?? 0), 0) > 0 ? summaryData.reduce((s, r) => s + (r.ot_vegetarian ?? 0), 0) : <span className="text-gray-300">â€”</span>}</td>
                                                        <td />
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                    </div>

                                    {/* Missing depts */}
                                    {missingDepts.length > 0 && (
                                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
                                            <div className="flex items-center gap-1.5 text-sm font-semibold text-amber-700">
                                                <Bell className="h-4 w-4" />
                                                ChÆ°a cÃ³ dá»¯ liá»‡u tá»«:
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {missingDepts.map(d => (
                                                    <span key={d.code} className="inline-block bg-amber-100 text-amber-800 border border-amber-300 text-xs px-2.5 py-1 rounded-full font-medium">{d.name}</span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )
                        })()}
                    </div>
                )}

                {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
                {/* TAB 4: MONTHLY STATS                          */}
                {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
                {activeTab === "monthly" && (
                    <div className="space-y-5">
                        <div className="flex items-center gap-2 font-semibold text-purple-700 text-lg">
                            <span className="text-xl">ðŸ“…</span>
                            Thá»‘ng kÃª suáº¥t cÆ¡m theo thÃ¡ng
                        </div>

                        {/* Month picker + fetch */}
                        <div className="flex flex-wrap items-end gap-3 bg-purple-50 border border-purple-200 rounded-xl p-4">
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-medium text-purple-700">ThÃ¡ng thanh toÃ¡n</label>
                                <input
                                    type="month"
                                    value={statsMonth}
                                    onChange={e => setStatsMonth(e.target.value)}
                                    className="border rounded-lg px-3 py-1.5 text-sm bg-white"
                                />
                            </div>
                            {/* Billing cycle badge */}
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-medium text-purple-700">Chu ká»³</label>
                                <div className="flex items-center gap-1.5 bg-purple-100 border border-purple-300 rounded-lg px-3 py-1.5 text-sm font-semibold text-purple-800">
                                    <CalendarDays className="h-3.5 w-3.5" />
                                    {getBillingCycle(statsMonth).label}
                                </div>
                            </div>
                            <button type="button"
                                onClick={fetchMonthStats}
                                disabled={statsLoading}
                                className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
                            >
                                {statsLoading ? (
                                    <span className="animate-spin text-base">â†»</span>
                                ) : (
                                    <span>ðŸ”</span>
                                )}
                                Xem thá»‘ng kÃª
                            </button>
                            {statsData && statsData.length > 0 && (
                                <button type="button"
                                    onClick={exportMonthlyExcel}
                                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                                >
                                    <FileSpreadsheet className="h-4 w-4" />
                                    Xuáº¥t Excel
                                </button>
                            )}
                        </div>

                        {statsError && (
                            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{statsError}</div>
                        )}

                        {statsData !== null && (() => {
                            if (statsData.length === 0) return <div className="text-center text-muted-foreground py-8">KhÃ´ng cÃ³ dá»¯ liá»‡u trong thÃ¡ng nÃ y</div>
                            const { days, deptGroups } = buildMonthlyPivot(statsData)
                            // Total per day (all sections including OT)
                            // Note: filter sr.shift !== 'OT' to avoid double-counting HPEEL OT
                            // which exists in both sectionRows ('Hand Peeling OT') AND dg.shifts (OT ShiftEntry)
                            const dayTotals = days.map(d =>
                                deptGroups.reduce((s, dg) =>
                                    s + dg.sectionRows.filter(sr => sr.shift !== 'OT').reduce((ss, sr) => ss + (sr.days.get(d) ?? 0), 0)
                                    + (dg.shifts.find(sh => sh.shift === 'OT')?.days.get(d) ?? 0), 0)
                            )
                            const grandTotal = dayTotals.reduce((a, b) => a + b, 0)
                            // Ca subtotals
                            const caTotal = (caNum: string) => days.map(d => deptGroups.reduce((s, dg) => s + dg.sectionRows.filter(sr => sr.shift === caNum).reduce((ss, sr) => ss + (sr.days.get(d) ?? 0), 0), 0))
                            const otDayTotals = days.map(d => deptGroups.reduce((s, dg) => s + (dg.shifts.find(sh => sh.shift === 'OT')?.days.get(d) ?? 0), 0))
                            const tvDayTotals = days.map(d => deptGroups.reduce((s, dg) => s + dg.sectionRows.reduce((ss, sr) => ss + (sr.seasonalDays.get(d) ?? 0), 0), 0))
                            const ctDayTotals = days.map(d => deptGroups.reduce((s, dg) => s + dg.sectionRows.reduce((ss, sr) => ss + (sr.officialDays.get(d) ?? 0), 0), 0))
                            const ca1Totals = caTotal('1'); const ca2Totals = caTotal('2'); const ca3Totals = caTotal('3')
                            return (
                                <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
                                    <div className="px-4 py-2.5 bg-muted/40 border-b text-sm font-semibold flex items-center justify-between">
                                        <div>
                                            <div className="font-bold text-sm">TIá»€N CÆ M CÃN Bá»˜ CÃ”NG NHÃ‚N VIÃŠN THÃNG {statsMonth}</div>
                                            <div className="text-xs text-muted-foreground font-normal">Chu ká»³: {getBillingCycle(statsMonth).label}</div>
                                        </div>
                                        <button type="button" onClick={exportMonthlyExcel} className="flex items-center gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg transition-colors">
                                            <FileSpreadsheet className="h-3.5 w-3.5" /> Xuáº¥t Excel
                                        </button>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="text-xs min-w-full border-collapse">
                                            <thead>
                                                <tr className="bg-slate-100 text-slate-700 border-b-2 border-slate-300">
                                                    <th className="px-3 py-2 font-bold text-left sticky left-0 bg-slate-100 z-10 min-w-[160px] border-r border-slate-300">
                                                        Bá»™ pháº­n
                                                    </th>
                                                    <th className="px-2 py-2 font-bold text-center sticky left-[160px] bg-slate-100 z-10 w-10 border-r border-slate-300">
                                                        Ca
                                                    </th>
                                                    {days.map(d => {
                                                        const isSunday = new Date(d + "T00:00:00").getDay() === 0
                                                        return (
                                                            <th key={d} className={`px-1.5 py-2 font-bold text-center w-8 ${isSunday ? "bg-orange-100 text-orange-600" : ""}`}>
                                                                {parseInt(d.slice(8), 10)}
                                                                {isSunday && <div className="text-[9px] font-normal leading-none">CN</div>}
                                                            </th>
                                                        )
                                                    })}
                                                    <th className="px-2 py-2 font-bold text-center bg-slate-200 border-l border-slate-300">Total</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {deptGroups.map(dept => {
                                                    const deptOT = dept.shifts.find(sh => sh.shift === 'OT')
                                                    const deptOTTotal = deptOT ? [...deptOT.days.values()].reduce((a, b) => a + b, 0) : 0
                                                    // filter shift !== 'OT' to avoid double-counting with deptOTTotal (from shiftMap)
                                                    const deptTotal = dept.sectionRows.filter(sr => sr.shift !== 'OT').reduce((s, sr) => s + [...sr.days.values()].reduce((a, b) => a + b, 0), 0) + (deptOTTotal ?? 0)
                                                    return (
                                                        <Fragment key={dept.code || dept.deptKey}>
                                                            {/* Dept group header row */}
                                                            <tr className="bg-slate-200 border-t-2 border-slate-400">
                                                                <td colSpan={days.length + 3}
                                                                    className="px-3 py-1 sticky left-0 font-bold text-slate-700 text-xs uppercase tracking-wide">
                                                                    ðŸ“¦ {dept.name}
                                                                    <span className="ml-2 text-slate-500 font-normal normal-case tracking-normal">
                                                                        â€” Tá»•ng: {deptTotal > 0 ? deptTotal : 0} pháº§n
                                                                    </span>
                                                                </td>
                                                            </tr>
                                                            {/* Section data rows â€” exclude shift='OT' since OT is shown in the deptOT row below */}
                                                            {dept.sectionRows.filter(sr => sr.shift !== 'OT').map((sr, sIdx) => {
                                                                const rowTotal = [...sr.days.values()].reduce((a, b) => a + b, 0)
                                                                const isTV = /thá»i vá»¥/i.test(sr.sectionName)
                                                                const shiftLabel = sr.shift === 'OT' ? 'OT' : `S${sr.shift}`
                                                                const shiftColor = sr.shift === '1' ? 'bg-blue-100 text-blue-700' : sr.shift === '2' ? 'bg-emerald-100 text-emerald-700' : sr.shift === '3' ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700'
                                                                const rowKey = `${sr.sectionName}|${sr.shift}`
                                                                const isRowEditing = editingRowKey === rowKey
                                                                return (
                                                                    <tr key={rowKey}
                                                                        className={`group border-b border-slate-100 ${isRowEditing ? 'bg-yellow-50' : isTV ? 'bg-blue-50/40 text-blue-700' : 'hover:bg-amber-50/40'}`}>
                                                                        <td className={`px-2 py-1 whitespace-nowrap sticky left-0 z-10 border-r border-slate-200 font-medium text-xs ${isRowEditing ? 'bg-yellow-50' : isTV ? 'bg-blue-50/60 italic text-blue-600' : 'bg-white text-slate-600'}`}>
                                                                            <div className="flex items-center gap-1">
                                                                                <span className="whitespace-nowrap">{sr.sectionName}</span>
                                                                                {canEdit && (
                                                                                    isRowEditing ? (
                                                                                        <div className="flex gap-1 ml-1 shrink-0">
                                                                                            <button
                                                                                                type="button"
                                                                                                disabled={rowSaving}
                                                                                                onClick={async () => {
                                                                                                    setRowSaving(true)
                                                                                                    // Rebuild pivot fresh from latest statsData to avoid stale closure issue
                                                    // (sr captured in closure may have outdated dayRowIds after prior saves)
                                                    const freshPivot = buildMonthlyPivot(statsData ?? [])
                                                    const freshSr = freshPivot.deptGroups
                                                        .flatMap(dg => dg.sectionRows)
                                                        .find(s => s.sectionName === sr.sectionName && s.shift === sr.shift) ?? sr
                                                    // Canonical Excel section name (e.g. "Manual Grading -Shift 2 (Ms Huệ)")
                                                    // buildMonthlyPivot already normalizes HPEEL section names to canonical form,
                                                    // so freshSr.sectionName is the correct department_name to use for INSERTs.
                                                    const canonicalSectionName = freshSr.sectionName
                                                    let savedCount = 0
                                                    const errors = []
                                                    for (const [date, draftVal] of Object.entries(rowEditDrafts)) {
                                                        const newVal = parseInt(draftVal) || 0
                                                        const orig = freshSr.days.get(date) ?? 0
                                                        if (newVal === orig) continue
                                                        // Find DB record. Pivot grouped rows by canonical section + shift,
                                                        // so dayRowIds[0] is the authoritative target. Trust it (no name re-validation).
                                                        const rowIds = freshSr.dayRowIds.get(date) ?? []
                                                        const rec = rowIds.length > 0
                                                            ? (statsData ?? []).find(r => r.id === rowIds[0])
                                                            : undefined
                                                        if (!rec) {
                                                            // INSERT new row using canonical section name. Guarantees that after
                                                            // refetch, the new row maps back to THIS section row (no jumping
                                                            // to Liên / Dung).
                                                            const deptIdForInsert = [...freshSr.departmentIds][0] ?? deptList.find(d => d.code === freshSr.deptCode)?.id
                                                            if (!deptIdForInsert) { errors.push(`${date}: thiếu department_id`); continue }
                                                            const res = await fetch('/api/meal-headcount', {
                                                                method: 'POST',
                                                                headers: { 'Content-Type': 'application/json' },
                                                                body: JSON.stringify({
                                                                    work_date: date,
                                                                    department_id: deptIdForInsert,
                                                                    department_name: canonicalSectionName,
                                                                    shift: freshSr.shift,
                                                                    official_present: isTV ? 0 : newVal,
                                                                    seasonal_present: isTV ? newVal : 0,
                                                                    official_absent: 0,
                                                                    seasonal_absent: 0,
                                                                    vegetarian: 0,
                                                                    ot_count: 0,
                                                                    ot_vegetarian: 0,
                                                                    note: 'Tạo từ bảng tháng báo cơm',
                                                                })
                                                            })
                                                            const json = await res.json().catch(() => ({}))
                                                            if (res.ok) {
                                                                savedCount++
                                                                const saved = Array.isArray(json.data) ? json.data[0] : json.data
                                                                if (saved && saved.id) {
                                                                    setStatsData(prev => prev ? [...prev.filter(r => r.id !== saved.id), saved] : [saved])
                                                                }
                                                            } else errors.push(`${date}: ${json.error || res.statusText}`)
                                                            continue
                                                        }
                                                        // PATCH: apply diff to existing record. Guard with rec.department_name
                                                        // (the actual stored name) so the server only updates THIS row -- never
                                                        // a sibling HPEEL row (Liên / Dung) sharing the same department_id.
                                                        const diff = newVal - orig
                                                        const oldOfficial = rec.official_present ?? 0
                                                        const oldSeasonal = rec.seasonal_present ?? 0
                                                        let newOfficial = oldOfficial + diff
                                                        let newSeasonal = oldSeasonal
                                                        if (newOfficial < 0) {
                                                            newSeasonal = Math.max(0, oldSeasonal + newOfficial)
                                                            newOfficial = 0
                                                        }
                                                        const newTotal = newOfficial + newSeasonal
                                                        const newVegetarian = Math.min(rec.vegetarian ?? 0, newTotal)
                                                        const res = await fetch('/api/meal-headcount', {
                                                            method: 'PATCH',
                                                            headers: { 'Content-Type': 'application/json' },
                                                            body: JSON.stringify({
                                                                id: rec.id,
                                                                official_present: newOfficial,
                                                                seasonal_present: newSeasonal,
                                                                vegetarian: newVegetarian,
                                                                ot_count: rec.ot_count ?? 0,
                                                                ot_vegetarian: rec.ot_vegetarian ?? 0,
                                                                expected_department_name: rec.department_name,
                                                            })
                                                        })
                                                        if (res.ok) {
                                                            savedCount++
                                                            // In-place update: keep table mounted, no flicker.
                                                            setStatsData(prev => prev ? prev.map(r => r.id === rec.id
                                                                ? { ...r, official_present: newOfficial, seasonal_present: newSeasonal, vegetarian: newVegetarian }
                                                                : r) : prev)
                                                        } else {
                                                            const j = await res.json().catch(() => ({}))
                                                            errors.push(`${date}: ${j.error || res.statusText}`)
                                                        }
                                                    }
                                                    if (savedCount > 0) {
                                                        setEditingRowKey(null)
                                                        setRowEditDrafts({})
                                                    }
                                                    if (errors.length > 0) {
                                                        alert('Lỗi lưu:\n' + errors.join('\n'))
                                                    } else if (savedCount === 0) {
                                                        alert('Không có thay đổi nào để lưu — vui lòng đổi số trước khi bấm 💾')
                                                    }
                                                    setRowSaving(false)
                                                                                                }}
                                                                                                className="px-1.5 py-0.5 bg-green-500 hover:bg-green-600 text-white text-[9px] font-bold rounded disabled:opacity-50 transition-colors"
                                                                                            >{rowSaving ? '...' : 'ðŸ’¾'}</button>
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() => { setEditingRowKey(null); setRowEditDrafts({}) }}
                                                                                                className="px-1.5 py-0.5 bg-slate-400 hover:bg-slate-500 text-white text-[9px] font-bold rounded transition-colors"
                                                                                            >âœ•</button>
                                                                                        </div>
                                                                                    ) : (
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() => {
                                                                                                setEditingRowKey(rowKey)
                                                                                                const drafts: Record<string, string> = {}
                                                                                                days.forEach(d => { drafts[d] = String(sr.days.get(d) ?? 0) })
                                                                                                setRowEditDrafts(drafts)
                                                                                            }}
                                                                                            className="shrink-0 px-2 py-0.5 bg-amber-100 hover:bg-amber-400 hover:text-white text-amber-700 text-[10px] font-bold rounded border border-amber-300 transition-colors"
                                                                                        >âœï¸ Sá»­a</button>
                                                                                    )
                                                                                )}
                                                                            </div>
                                                                        </td>
                                                                        <td className={`px-1 py-1 sticky left-[160px] z-10 text-center border-r border-slate-200 ${isRowEditing ? 'bg-yellow-50' : 'bg-white'}`}>
                                                                            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${shiftColor}`}>{shiftLabel}</span>
                                                                        </td>
                                                                        {days.map(d => {
                                                                            const isSunday = new Date(d + "T00:00:00").getDay() === 0
                                                                            const v = isRowEditing ? (parseInt(rowEditDrafts[d]) || 0) : (sr.days.get(d) ?? 0)
                                                                            const origV = sr.days.get(d) ?? 0
                                                                            const changed = isRowEditing && parseInt(rowEditDrafts[d] ?? '') !== origV
                                                                            return (
                                                                                <td key={d}
                                                                                    className={`px-0 py-0 text-center text-xs ${isRowEditing ? (changed ? 'bg-yellow-100' : 'bg-yellow-50') :
                                                                                        isSunday ? 'bg-orange-50 text-orange-400' :
                                                                                            origV > 0 ? (isTV ? 'text-blue-600 font-semibold' : 'font-semibold text-slate-800') : 'text-slate-200'
                                                                                        }`}
                                                                                >
                                                                                    {isRowEditing ? (
                                                                                        <input
                                                                                            type="number"
                                                                                            min={0}
                                                                                            value={rowEditDrafts[d] ?? ''}
                                                                                            onChange={e => setRowEditDrafts(prev => ({ ...prev, [d]: e.target.value }))}
                                                                                            onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); if (e.key === 'Escape') { setEditingRowKey(null); setRowEditDrafts({}) } }}
                                                                                            className={`w-10 h-6 text-center text-xs rounded outline-none font-semibold ${changed ? 'border-2 border-amber-400 bg-amber-50' : 'border border-slate-200 bg-yellow-50'
                                                                                                }`}
                                                                                        />
                                                                                    ) : (
                                                                                        <span className="block px-1.5 py-1">
                                                                                            {origV > 0 ? origV : 'â€”'}
                                                                                        </span>
                                                                                    )}
                                                                                </td>
                                                                            )
                                                                        })}
                                                                        <td className={`px-2 py-1 text-center font-bold border-l border-slate-200 text-xs ${rowTotal > 0 ? (isTV ? 'text-blue-700' : 'text-slate-700') : 'text-slate-300'
                                                                            }`}>
                                                                            {rowTotal > 0 ? rowTotal : ''}
                                                                        </td>
                                                                    </tr>
                                                                )
                                                            })}
                                                            {/* OT row for this dept group - always show */}
                                                            {(() => {
                                                                const otRowKey = `${dept.name}|OT`
                                                                const isOTEditing = editingRowKey === otRowKey
                                                                return (
                                                                    <tr className={`group border-b border-orange-100 ${isOTEditing ? 'bg-yellow-50' : 'bg-orange-50'}`}>
                                                                        <td className={`px-2 py-1 whitespace-nowrap sticky left-0 z-10 border-r border-orange-100 font-semibold text-xs ${isOTEditing ? 'bg-yellow-50 text-orange-700' : 'bg-orange-50 text-orange-700 italic'}`}>
                                                                            <div className="flex items-center gap-1">
                                                                                <span className="whitespace-nowrap">{dept.name} (TÄƒng ca)</span>
                                                                                {canEdit && (
                                                                                    isOTEditing ? (
                                                                                        <div className="flex gap-1 ml-1 shrink-0">
                                                                                            <button
                                                                                                type="button"
                                                                                                disabled={rowSaving}
                                                                                                onClick={async () => {
                                                                                                    setRowSaving(true)
                                                                                                    let savedCount = 0
                                                                                                    const errors = []
                                                                                                    for (const [date, draftVal] of Object.entries(rowEditDrafts)) {
                                                                                                        const newVal = parseInt(draftVal) || 0
                                                                                                        const orig = deptOT?.days.get(date) ?? 0
                                                                                                        if (newVal === orig) continue
                                                                                                        const rowIds = deptOT?.dayRowIds.get(date) ?? []
                                                                                                        if (rowIds.length === 0) continue
                                                                                                        const rec = (statsData ?? []).find(r => r.id === rowIds[0])
                                                                                                        if (!rec) continue
                                                                                                        // newVal is ot_count + ot_vegetarian combined; subtract veg to get ot_count.
                                                                                                        const newOtCount = Math.max(0, newVal - (rec.ot_vegetarian ?? 0))
                                                                                                        const res = await fetch('/api/meal-headcount', {
                                                                                                            method: 'PATCH',
                                                                                                            headers: { 'Content-Type': 'application/json' },
                                                                                                            body: JSON.stringify({
                                                                                                                id: rec.id,
                                                                                                                official_present: rec.official_present ?? 0,
                                                                                                                seasonal_present: rec.seasonal_present ?? 0,
                                                                                                                vegetarian: rec.vegetarian ?? 0,
                                                                                                                ot_count: newOtCount,
                                                                                                                ot_vegetarian: rec.ot_vegetarian ?? 0,
                                                                                                                // Guard: server only updates this exact department row, never a sibling
                                                                                                                // HPEEL row (Liên / Dung) sharing the same department_id.
                                                                                                                expected_department_name: rec.department_name,
                                                                                                            }),
                                                                                                        })
                                                                                                        if (res.ok) {
                                                                                                            savedCount++
                                                                                                            setStatsData(prev => prev ? prev.map(r => r.id === rec.id
                                                                                                                ? { ...r, ot_count: newOtCount }
                                                                                                                : r) : prev)
                                                                                                        } else {
                                                                                                            const j = await res.json().catch(() => ({}))
                                                                                                            errors.push(`${date}: ${j.error || res.statusText}`)
                                                                                                        }
                                                                                                    }
                                                                                                    if (savedCount > 0) {
                                                                                                        setEditingRowKey(null)
                                                                                                        setRowEditDrafts({})
                                                                                                    }
                                                                                                    if (errors.length > 0) {
                                                                                                        alert('Lỗi lưu OT:\n' + errors.join('\n'))
                                                                                                    }
                                                                                                    setRowSaving(false)
                                                                                                }}
                                                                                                className="px-1.5 py-0.5 bg-green-500 hover:bg-green-600 text-white text-[9px] font-bold rounded disabled:opacity-50 transition-colors"
                                                                                            >{rowSaving ? '...' : 'ðŸ’¾'}</button>
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() => { setEditingRowKey(null); setRowEditDrafts({}) }}
                                                                                                className="px-1.5 py-0.5 bg-slate-400 hover:bg-slate-500 text-white text-[9px] font-bold rounded transition-colors"
                                                                                            >âœ•</button>
                                                                                        </div>
                                                                                    ) : (
                                                                                        <button type="button"
                                                                                            onClick={() => {
                                                                                                setEditingRowKey(otRowKey)
                                                                                                const drafts: Record<string, string> = {}
                                                                                                days.forEach(d => { drafts[d] = String(deptOT?.days.get(d) ?? 0) })
                                                                                                setRowEditDrafts(drafts)
                                                                                            }}
                                                                                            className="shrink-0 px-2 py-0.5 bg-orange-100 hover:bg-orange-400 hover:text-white text-orange-700 text-[10px] font-bold rounded border border-orange-300 transition-colors"
                                                                                        >âœï¸ Sá»­a</button>
                                                                                    )
                                                                                )}
                                                                            </div>
                                                                        </td>
                                                                        <td className={`px-1 py-1 sticky left-[160px] z-10 text-center border-r border-orange-100 ${isOTEditing ? 'bg-yellow-50' : 'bg-orange-50'}`}>
                                                                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-700">TÄƒng ca</span>
                                                                        </td>
                                                                        {days.map(d => {
                                                                            const origV = deptOT?.days.get(d) ?? 0
                                                                            const changed = isOTEditing && parseInt(rowEditDrafts[d] ?? '') !== origV
                                                                            return (
                                                                                <td key={d} className={`px-0 py-0 text-center text-xs ${isOTEditing ? (changed ? 'bg-yellow-100' : 'bg-yellow-50') :
                                                                                    origV > 0 ? 'text-orange-600 font-semibold' : 'text-orange-200'
                                                                                    }`}>
                                                                                    {isOTEditing ? (
                                                                                        <input
                                                                                            type="number"
                                                                                            min={0}
                                                                                            value={rowEditDrafts[d] ?? ''}
                                                                                            onChange={e => setRowEditDrafts(prev => ({ ...prev, [d]: e.target.value }))}
                                                                                            onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); if (e.key === 'Escape') { setEditingRowKey(null); setRowEditDrafts({}) } }}
                                                                                            className={`w-10 h-6 text-center text-xs rounded outline-none font-semibold ${changed ? 'border-2 border-amber-400 bg-amber-50' : 'border border-slate-200 bg-yellow-50'
                                                                                                }`}
                                                                                        />
                                                                                    ) : (
                                                                                        <span className="block px-1.5 py-1">{origV > 0 ? origV : 'â€”'}</span>
                                                                                    )}
                                                                                </td>
                                                                            )
                                                                        })}
                                                                        <td className="px-2 py-1 text-center font-bold text-orange-700 border-l border-orange-100 text-xs">
                                                                            {deptOTTotal > 0 ? deptOTTotal : 'â€”'}
                                                                        </td>
                                                                    </tr>
                                                                )
                                                            })()}
                                                        </Fragment>
                                                    )
                                                })}
                                            </tbody>
                                            {/* Footer rows matching Excel format */}
                                            <tfoot>
                                                <tr className="bg-slate-700 text-white font-bold border-t-2 border-slate-500">
                                                    <td className="px-3 py-2 sticky left-0 bg-slate-700 z-10 border-r border-slate-500">Tá»”NG</td>
                                                    <td className="px-2 py-2 sticky left-[160px] bg-slate-700 z-10 border-r border-slate-500"></td>
                                                    {dayTotals.map((v, i) => { const isSun = new Date(days[i] + "T00:00:00").getDay() === 0; return <td key={days[i]} className={`px-1.5 py-2 text-center ${isSun ? "bg-orange-800/40" : ""}`}>{v > 0 ? v : ''}</td> })}
                                                    <td className="px-2 py-2 text-center border-l border-slate-500">{grandTotal}</td>
                                                </tr>
                                                <tr className="bg-blue-600 text-white text-[11px]">
                                                    <td className="px-3 py-1.5 sticky left-0 bg-blue-600 z-10 font-semibold border-r border-blue-400">Ca 1:</td>
                                                    <td className="px-2 py-1.5 sticky left-[160px] bg-blue-600 z-10 border-r border-blue-400"></td>
                                                    {ca1Totals.map((v, i) => { const isSun = new Date(days[i] + "T00:00:00").getDay() === 0; return <td key={days[i]} className={`px-1.5 py-1.5 text-center ${isSun ? "bg-blue-800/40" : ""}`}>{v > 0 ? v : ''}</td> })}
                                                    <td className="px-2 py-1.5 text-center font-bold border-l border-blue-400">{ca1Totals.reduce((a, b) => a + b, 0)}</td>
                                                </tr>
                                                <tr className="bg-blue-500 text-white text-[11px]">
                                                    <td className="px-3 py-1.5 sticky left-0 bg-blue-500 z-10 font-semibold border-r border-blue-300">Ca 2:</td>
                                                    <td className="px-2 py-1.5 sticky left-[160px] bg-blue-500 z-10 border-r border-blue-300"></td>
                                                    {ca2Totals.map((v, i) => { const isSun = new Date(days[i] + "T00:00:00").getDay() === 0; return <td key={days[i]} className={`px-1.5 py-1.5 text-center ${isSun ? "bg-blue-800/40" : ""}`}>{v > 0 ? v : ''}</td> })}
                                                    <td className="px-2 py-1.5 text-center font-bold border-l border-blue-300">{ca2Totals.reduce((a, b) => a + b, 0)}</td>
                                                </tr>
                                                <tr className="bg-blue-400 text-white text-[11px]">
                                                    <td className="px-3 py-1.5 sticky left-0 bg-blue-400 z-10 font-semibold border-r border-blue-200">Ca 3:</td>
                                                    <td className="px-2 py-1.5 sticky left-[160px] bg-blue-400 z-10 border-r border-blue-200"></td>
                                                    {ca3Totals.map((v, i) => { const isSun = new Date(days[i] + "T00:00:00").getDay() === 0; return <td key={days[i]} className={`px-1.5 py-1.5 text-center ${isSun ? "bg-blue-800/40" : ""}`}>{v > 0 ? v : ''}</td> })}
                                                    <td className="px-2 py-1.5 text-center font-bold border-l border-blue-200">{ca3Totals.reduce((a, b) => a + b, 0)}</td>
                                                </tr>
                                                <tr className="bg-orange-500 text-white text-[11px]">
                                                    <td className="px-3 py-1.5 sticky left-0 bg-orange-500 z-10 font-semibold border-r border-orange-300">TÄƒng ca</td>
                                                    <td className="px-2 py-1.5 sticky left-[160px] bg-orange-500 z-10 border-r border-orange-300"></td>
                                                    {otDayTotals.map((v, i) => { const isSun = new Date(days[i] + "T00:00:00").getDay() === 0; return <td key={days[i]} className={`px-1.5 py-1.5 text-center ${isSun ? "bg-orange-800/40" : ""}`}>{v > 0 ? v : ''}</td> })}
                                                    <td className="px-2 py-1.5 text-center font-bold border-l border-orange-300">{otDayTotals.reduce((a, b) => a + b, 0)}</td>
                                                </tr>
                                                <tr className="bg-purple-100 text-purple-800 text-[11px]">
                                                    <td className="px-3 py-1.5 sticky left-0 bg-purple-100 z-10 font-semibold border-r border-purple-200">Thá»i vá»¥</td>
                                                    <td className="px-2 py-1.5 sticky left-[160px] bg-purple-100 z-10 border-r border-purple-200"></td>
                                                    {tvDayTotals.map((v, i) => { const isSun = new Date(days[i] + "T00:00:00").getDay() === 0; return <td key={days[i]} className={`px-1.5 py-1.5 text-center ${isSun ? "bg-purple-800/30" : ""}`}>{v > 0 ? v : ''}</td> })}
                                                    <td className="px-2 py-1.5 text-center font-bold border-l border-purple-200">{tvDayTotals.reduce((a, b) => a + b, 0)}</td>
                                                </tr>
                                                <tr className="bg-green-100 text-green-800 text-[11px]">
                                                    <td className="px-3 py-1.5 sticky left-0 bg-green-100 z-10 font-semibold border-r border-green-200">ChÃ­nh thá»©c</td>
                                                    <td className="px-2 py-1.5 sticky left-[160px] bg-green-100 z-10 border-r border-green-200"></td>
                                                    {ctDayTotals.map((v, i) => { const isSun = new Date(days[i] + "T00:00:00").getDay() === 0; return <td key={days[i]} className={`px-1.5 py-1.5 text-center ${isSun ? "bg-green-800/30" : ""}`}>{v > 0 ? v : ''}</td> })}
                                                    <td className="px-2 py-1.5 text-center font-bold border-l border-green-200">{ctDayTotals.reduce((a, b) => a + b, 0)}</td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                </div>
                            )
                        })()}
                    </div>
                )}

                {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
                {/* TAB 1: PARSE & SAVE                        */}
                {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
                {false && (
                    <>
                        {/* Paste area */}
                        {!parsed && (
                            <div className="bg-card rounded-xl border shadow-sm p-4 space-y-4">
                                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                    <ClipboardPaste className="h-4 w-4" />
                                    Paste ná»™i dung chat Zalo vÃ o Ä‘Ã¢y (copy táº¥t cáº£ cÃ¡c tin nháº¯n bÃ¡o cÆ¡m cá»§a ngÃ y)
                                </div>
                                <textarea
                                    id="zalo-paste-area"
                                    value={rawText}
                                    onChange={(e) => setRawText(e.target.value)}
                                    placeholder={`VÃ­ dá»¥:\n28.3.2026\nKhu vá»±c : Boiler\nCa: 1.2.3\nChÃ­nh thá»©c hiá»‡n diá»‡n: 3\nChÃ­nh thá»©c váº¯ng: 0\n2Thá»i vá»¥ hiá»‡n diá»‡n:0\nThá»i vá»¥ váº¯ng :0\nOT:\n\nDate: 28/03/2026\nKhu vá»±c : Peeling mc\nCa: 1\nChÃ­nh thá»©c hiá»‡n diá»‡n: 7\n...`}
                                    rows={16}
                                    className="w-full rounded-lg border bg-muted/30 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-400 resize-y"
                                    style={{ minHeight: "260px" }}
                                />
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <p className="text-xs text-muted-foreground">
                                        ðŸ’¡ KhÃ´ng cáº§n xÃ³a tÃªn ngÆ°á»i gá»­i hay timestamp â€” há»‡ thá»‘ng tá»± bá» qua.
                                    </p>
                                    <div className="flex gap-2">
                                        {/* AI Parse button */}
                                        <Button
                                            id="ai-parse-btn"
                                            onClick={handleAIParse}
                                            disabled={!rawText.trim() || aiParsing}
                                            className="gap-2 bg-purple-600 hover:bg-purple-700 text-white px-5"
                                        >
                                            {aiParsing ? (
                                                <RefreshCw className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <Sparkles className="h-4 w-4" />
                                            )}
                                            {aiParsing ? "AI Ä‘ang xá»­ lÃ½..." : "ðŸ¤– AI PhÃ¢n tÃ­ch"}
                                        </Button>
                                        {/* Manual parse button */}
                                        <Button
                                            id="parse-btn"
                                            onClick={handleParse}
                                            disabled={!rawText.trim()}
                                            className="gap-2 bg-orange-600 hover:bg-orange-700 text-white px-6"
                                        >
                                            <Sparkles className="h-4 w-4" />
                                            PhÃ¢n tÃ­ch ngay
                                        </Button>
                                    </div>
                                </div>
                                {aiError && (
                                    <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-2">
                                        <AlertCircle className="h-4 w-4 flex-shrink-0" />
                                        <span>AI lá»—i: {aiError}</span>
                                    </div>
                                )}
                                {aiTruncated && (
                                    <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                                        <AlertCircle className="h-4 w-4 flex-shrink-0" />
                                        <span>âš ï¸ Text quÃ¡ dÃ i â€” AI chá»‰ Ä‘á»c Ä‘Æ°á»£c pháº§n Ä‘áº§u (~8000 kÃ½ tá»±). Káº¿t quáº£ cÃ³ thá»ƒ thiáº¿u. HÃ£y paste tá»«ng ca riÃªng Ä‘á»ƒ Ä‘áº£m báº£o Ä‘áº§y Ä‘á»§.</span>
                                    </div>
                                )}
                            </div>
                        )}


                        {/* Results */}
                        {parsed && (
                            <>
                                {/* Action buttons */}
                                <div className="flex flex-wrap gap-2">
                                    <Button variant="outline" size="sm" onClick={handleCopyTable} className="gap-2">
                                        {copied ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                                        {copied ? "ÄÃ£ copy!" : "Copy báº£ng"}
                                    </Button>
                                    <Button size="sm" onClick={() => exportCSV(records)} className="gap-2 bg-green-600 hover:bg-green-700 text-white">
                                        <Download className="h-4 w-4" />
                                        Xuáº¥t Excel (.csv)
                                    </Button>
                                    {canSave && records.length > 0 && (
                                        <Button
                                            size="sm"
                                            onClick={handleSaveToDB}
                                            disabled={saving}
                                            className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                                        >
                                            <Save className="h-4 w-4" />
                                            {saving ? "Äang lÆ°u..." : `ðŸ’¾ LÆ°u ${records.length} báº£n ghi vÃ o DB`}
                                        </Button>
                                    )}
                                    <Button
                                        size="sm"
                                        onClick={() => setShowSummary(s => !s)}
                                        className={`gap-2 ${showSummary ? "bg-orange-600 hover:bg-orange-700" : "bg-orange-500 hover:bg-orange-600"} text-white`}
                                    >
                                        <BarChart3 className="h-4 w-4" />
                                        Tá»•ng há»£p bÃ¡o cÆ¡m
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={handleReset} className="gap-2">
                                        <RefreshCw className="h-4 w-4" />
                                        LÃ m má»›i
                                    </Button>
                                </div>


                                {/* Summary panel */}
                                {showSummary && (
                                    <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 space-y-4">
                                        <div className="flex items-center gap-2 font-semibold text-orange-700">
                                            <MessageSquare className="h-4 w-4" />
                                            Tá»•ng há»£p bÃ¡o cÆ¡m nhÃ  Äƒn
                                        </div>

                                        {/* Date + Shift selectors */}
                                        <div className="flex flex-wrap items-end gap-3">
                                            <div className="flex flex-col gap-1">
                                                <label className="text-xs font-medium text-orange-700">NgÃ y</label>
                                                <input
                                                    type="date"
                                                    value={summaryDate}
                                                    onChange={e => setSummaryDate(e.target.value)}
                                                    className="border border-orange-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
                                                />
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <label className="text-xs font-medium text-orange-700">Ca</label>
                                                <div className="flex gap-1">
                                                    {["1", "2", "3"].map(s => (
                                                        <button type="button"
                                                            key={s}
                                                            onClick={() => setSummaryShift(s)}
                                                            className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${summaryShift === s
                                                                ? "bg-orange-500 text-white border-orange-500"
                                                                : "bg-white text-orange-700 border-orange-300 hover:bg-orange-100"
                                                                }`}
                                                        >{s}</button>
                                                    ))}
                                                </div>
                                            </div>
                                            <button type="button"
                                                onClick={fetchSummaryFromDB}
                                                disabled={summaryLoading}
                                                className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                                            >
                                                <BarChart3 className="h-4 w-4" />
                                                {summaryLoading ? "Äang táº£i..." : "Tá»•ng há»£p"}
                                            </button>
                                        </div>

                                        {summaryError && (
                                            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{summaryError}</div>
                                        )}

                                        {summaryData !== null && (() => {
                                            if (summaryData!.length === 0) return (
                                                <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                                    KhÃ´ng cÃ³ dá»¯ liá»‡u cho ngÃ y nÃ y â€” cÃ³ thá»ƒ chÆ°a lÆ°u hoáº·c chÆ°a bÃ¡o Ä‘á»§.
                                                </div>
                                            )
                                            const msgText = buildDBSummaryText(summaryData!)
                                            const missingDepts = getDBMissingDepts(summaryData!, summaryShift)
                                            return (
                                                <div className="space-y-3">
                                                    {/* Kitchen message */}
                                                    <div className="bg-white rounded-lg border border-orange-100 p-3 font-mono text-sm whitespace-pre-wrap text-gray-800">
                                                        {msgText}
                                                    </div>
                                                    <button type="button"
                                                        onClick={() => {
                                                            navigator.clipboard.writeText(msgText)
                                                            setCopiedSummary(true)
                                                            setTimeout(() => setCopiedSummary(false), 2000)
                                                        }}
                                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${copiedSummary ? "bg-green-600 text-white" : "bg-orange-600 hover:bg-orange-700 text-white"
                                                            }`}
                                                    >
                                                        {copiedSummary ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                                        {copiedSummary ? "ÄÃ£ copy!" : "Copy tin nháº¯n"}
                                                    </button>

                                                    {/* Per-dept breakdown */}
                                                    <div className="overflow-x-auto">
                                                        <table className="w-full text-xs border rounded-lg overflow-hidden">
                                                            <thead>
                                                                <tr className="bg-orange-100 text-orange-700 text-left">
                                                                    <th className="px-2 py-1.5 font-semibold">Bá»™ pháº­n</th>
                                                                    <th className="px-2 py-1.5 font-semibold text-right">ChÃ­nh thá»©c</th>
                                                                    <th className="px-2 py-1.5 font-semibold text-right">Thá»i vá»¥</th>
                                                                    <th className="px-2 py-1.5 font-semibold text-right">Chay</th>
                                                                    <th className="px-2 py-1.5 font-semibold text-right">TÄƒng ca</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y">
                                                                {summaryData!.map(r => (
                                                                    <tr key={r.id} className="hover:bg-orange-50">
                                                                        <td className="px-2 py-1 font-medium">
                                                                            {r.department_id
                                                                                ? (deptList.find(d => d.id === r.department_id)?.name_en ?? r.department_name)
                                                                                : r.department_name}
                                                                        </td>
                                                                        <td className="px-2 py-1 text-right text-green-700 font-semibold">{r.official_present ?? 0}</td>
                                                                        <td className="px-2 py-1 text-right">{r.seasonal_present ?? 0}</td>
                                                                        <td className="px-2 py-1 text-right text-emerald-600">{r.vegetarian ?? 0}</td>
                                                                        <td className="px-2 py-1 text-right font-semibold">{(r.ot_count ?? 0) + (r.ot_vegetarian ?? 0)}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>

                                                    {/* Missing depts */}
                                                    {missingDepts.length > 0 && (
                                                        <div className="space-y-1">
                                                            <div className="flex items-center gap-1.5 text-sm font-semibold text-amber-700">
                                                                <Bell className="h-4 w-4" />
                                                                ChÆ°a cÃ³ dá»¯ liá»‡u tá»« cÃ¡c bá»™ pháº­n:
                                                            </div>
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {missingDepts.map(d => (
                                                                    <span key={d.code} className="inline-block bg-amber-100 text-amber-800 border border-amber-300 text-xs px-2 py-0.5 rounded-full font-medium">{d.name}</span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })()}
                                    </div>
                                )}

                                {/* Save message */}
                                {saveMsg && (
                                    <div className={`rounded-lg px-4 py-2.5 text-sm font-medium ${saveMsg!.type === "ok"
                                        ? "bg-green-50 text-green-700 border border-green-200"
                                        : "bg-red-50 text-red-700 border border-red-200"
                                        }`}>
                                        {saveMsg!.text}
                                    </div>
                                )}

                                {/* Summary cards */}
                                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                                    {[
                                        { label: "Bá»™ pháº­n", value: records.length, unit: "KV", bg: "bg-blue-50", text: "text-blue-600", border: "border-blue-200" },
                                        { label: "CT Hiá»‡n diá»‡n", value: summary.totalOfficial, unit: "ngÆ°á»i", bg: "bg-green-50", text: "text-green-600", border: "border-green-200" },
                                        { label: "CT Váº¯ng", value: summary.totalAbsent, unit: "ngÆ°á»i", bg: "bg-red-50", text: "text-red-600", border: "border-red-200" },
                                        { label: "TV Hiá»‡n diá»‡n", value: summary.totalSeasonal, unit: "ngÆ°á»i", bg: "bg-purple-50", text: "text-purple-600", border: "border-purple-200" },
                                        { label: "Chay hÃ´m nay", value: summary.totalVeg || "â€”", unit: summary.totalVeg ? "suáº¥t" : "", bg: "bg-orange-50", text: "text-orange-600", border: "border-orange-200" },
                                    ].map((s) => (
                                        <div key={s.label} className={`rounded-xl border p-4 shadow-sm ${s.bg} ${s.border}`}>
                                            <p className="text-xs text-muted-foreground">{s.label}</p>
                                            <p className={`text-3xl font-bold ${s.text} mt-1`}>{s.value}</p>
                                            <p className="text-xs text-muted-foreground mt-0.5">{s.unit}</p>
                                        </div>
                                    ))}
                                </div>

                                {records.length === 0 ? (
                                    <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-center space-y-2">
                                        <AlertCircle className="h-8 w-8 text-yellow-500 mx-auto" />
                                        <p className="font-semibold text-yellow-800">KhÃ´ng tÃ¬m tháº¥y dá»¯ liá»‡u há»£p lá»‡</p>
                                        <p className="text-sm text-yellow-700">
                                            Há»‡ thá»‘ng cáº§n tÃ¬m tháº¥y cÃ¡c tá»« khÃ³a nhÆ° &quot;Khu vá»±c&quot;, &quot;ChÃ­nh thá»©c hiá»‡n diá»‡n&quot;, cÃ¹ng vá»›i ngÃ y thÃ¡ng.
                                        </p>
                                        <Button variant="outline" size="sm" onClick={handleReset} className="mt-2 gap-2">
                                            <RefreshCw className="h-4 w-4" /> Thá»­ láº¡i
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
                                        <div className="px-4 py-3 border-b flex items-center justify-between bg-muted/40">
                                            <div className="flex items-center gap-2">
                                                <TableIcon className="h-4 w-4 text-muted-foreground" />
                                                <span className="font-semibold text-sm">
                                                    Káº¿t quáº£ â€” {uniqueDates.join(", ")} &nbsp;|&nbsp; {records.length} khu vá»±c
                                                </span>
                                            </div>
                                        </div>

                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm">
                                                <thead>
                                                    <tr className="bg-muted/60 text-left text-xs text-muted-foreground uppercase tracking-wide">
                                                        <th className="px-3 py-2.5 font-semibold">#</th>
                                                        <th className="px-3 py-2.5 font-semibold">NgÃ y</th>
                                                        <th className="px-3 py-2.5 font-semibold">Khu vá»±c</th>
                                                        <th className="px-3 py-2.5 font-semibold">Ca</th>
                                                        <th className="px-3 py-2.5 font-semibold text-right">ChÃ­nh thá»©c</th>
                                                        <th className="px-3 py-2.5 font-semibold text-right">ChÃ­nh thá»©c váº¯ng</th>
                                                        <th className="px-3 py-2.5 font-semibold text-right">Thá»i vá»¥</th>
                                                        <th className="px-3 py-2.5 font-semibold text-right">Thá»i vá»¥ váº¯ng</th>
                                                        <th className="px-3 py-2.5 font-semibold text-right">TÄƒng ca</th>
                                                        <th className="px-3 py-2.5 font-semibold text-right">ðŸ¥¦ Chay</th>
                                                        <th className="px-3 py-2.5 font-semibold">DB Link</th>
                                                        <th className="px-3 py-2.5 font-semibold text-center">Nguá»“n</th>
                                                        <th className="px-3 py-2.5 font-semibold text-center w-24">Confirm</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y">
                                                    {records.map((r, i) => {
                                                        const effArea = getEffectiveArea(r, i)
                                                        const deptId = getEffectiveDeptId(r, i)
                                                        const linked = deptList.find((d) => d.id === deptId)
                                                        const isUnknown = !linked && !hasDeptRule(effArea)
                                                        return (
                                                            <>
                                                                <tr className="hover:bg-muted/30 transition-colors">
                                                                    <td className="px-3 py-2.5 text-muted-foreground">{i + 1}</td>
                                                                    <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap">
                                                                        {r.date || <span className="text-yellow-500">?</span>}
                                                                    </td>
                                                                    <td className="px-3 py-2.5 font-medium whitespace-nowrap">{effArea}</td>
                                                                    <td className="px-3 py-2.5 text-center">
                                                                        <span className="inline-block bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                                                                            Ca {r.shift === 'OT' ? 'OT' : (r.shift?.replace(/[^1-3]/g, '') || '1')}
                                                                        </span>
                                                                    </td>
                                                                    {/* CT HÄ â€” editable */}
                                                                    <td className="px-3 py-2.5 text-right">
                                                                        {editingCell?.row === i && editingCell?.field === 'officialPresent' ? (
                                                                            <input autoFocus type="number" value={editDraft}
                                                                                onChange={e => setEditDraft(e.target.value)}
                                                                                onBlur={() => commitEdit(i, 'officialPresent')}
                                                                                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditingCell(null) }}
                                                                                className="w-16 text-right border border-blue-400 rounded px-1 py-0 text-sm bg-blue-50 focus:outline-none" />
                                                                        ) : (
                                                                            <span className="font-bold text-green-700 cursor-pointer hover:ring-1 hover:ring-blue-300 rounded px-1" title="Click Ä‘á»ƒ sá»­a"
                                                                                onClick={() => { setEditingCell({ row: i, field: 'officialPresent' }); setEditDraft(String(r.officialPresent ?? '')) }}>
                                                                                {r.officialPresent ?? <span className="text-muted-foreground font-normal">â€”</span>}
                                                                                {r.officialPresentNote && <span className="text-xs font-normal text-muted-foreground ml-1">{r.officialPresentNote}</span>}
                                                                            </span>
                                                                        )}
                                                                    </td>
                                                                    {/* CT Váº¯ng â€” editable */}
                                                                    <td className="px-3 py-2.5 text-right">
                                                                        {editingCell?.row === i && editingCell?.field === 'officialAbsent' ? (
                                                                            <input autoFocus type="number" value={editDraft}
                                                                                onChange={e => setEditDraft(e.target.value)}
                                                                                onBlur={() => commitEdit(i, 'officialAbsent')}
                                                                                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditingCell(null) }}
                                                                                className="w-16 text-right border border-blue-400 rounded px-1 py-0 text-sm bg-blue-50 focus:outline-none" />
                                                                        ) : (
                                                                            <span className={`cursor-pointer hover:ring-1 hover:ring-blue-300 rounded px-1 ${r.officialAbsent != null && r.officialAbsent > 0 ? 'font-bold text-red-600' : 'text-muted-foreground'}`}
                                                                                title="Click Ä‘á»ƒ sá»­a"
                                                                                onClick={() => { setEditingCell({ row: i, field: 'officialAbsent' }); setEditDraft(String(r.officialAbsent ?? '')) }}>
                                                                                {r.officialAbsent ?? 'â€”'}
                                                                            </span>
                                                                        )}
                                                                    </td>
                                                                    {/* TV HÄ â€” editable */}
                                                                    <td className="px-3 py-2.5 text-right">
                                                                        {editingCell?.row === i && editingCell?.field === 'seasonalPresent' ? (
                                                                            <input autoFocus type="number" value={editDraft}
                                                                                onChange={e => setEditDraft(e.target.value)}
                                                                                onBlur={() => commitEdit(i, 'seasonalPresent')}
                                                                                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditingCell(null) }}
                                                                                className="w-16 text-right border border-blue-400 rounded px-1 py-0 text-sm bg-blue-50 focus:outline-none" />
                                                                        ) : (
                                                                            <span className="cursor-pointer hover:ring-1 hover:ring-blue-300 rounded px-1 text-muted-foreground" title="Click Ä‘á»ƒ sá»­a"
                                                                                onClick={() => { setEditingCell({ row: i, field: 'seasonalPresent' }); setEditDraft(String(r.seasonalPresent ?? '')) }}>
                                                                                {r.seasonalPresent ?? 'â€”'}
                                                                            </span>
                                                                        )}
                                                                    </td>
                                                                    {/* TV Váº¯ng â€” editable */}
                                                                    <td className="px-3 py-2.5 text-right">
                                                                        {editingCell?.row === i && editingCell?.field === 'seasonalAbsent' ? (
                                                                            <input autoFocus type="number" value={editDraft}
                                                                                onChange={e => setEditDraft(e.target.value)}
                                                                                onBlur={() => commitEdit(i, 'seasonalAbsent')}
                                                                                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditingCell(null) }}
                                                                                className="w-16 text-right border border-blue-400 rounded px-1 py-0 text-sm bg-blue-50 focus:outline-none" />
                                                                        ) : (
                                                                            <span className="cursor-pointer hover:ring-1 hover:ring-blue-300 rounded px-1 text-muted-foreground" title="Click Ä‘á»ƒ sá»­a"
                                                                                onClick={() => { setEditingCell({ row: i, field: 'seasonalAbsent' }); setEditDraft(String(r.seasonalAbsent ?? '')) }}>
                                                                                {r.seasonalAbsent ?? 'â€”'}
                                                                            </span>
                                                                        )}
                                                                    </td>
                                                                    {/* OT â€” editable + shift timing label */}
                                                                    <td className="px-3 py-2.5 text-right text-xs">
                                                                        {editingCell?.row === i && editingCell?.field === 'ot' ? (
                                                                            <input autoFocus type="text" value={editDraft}
                                                                                onChange={e => setEditDraft(e.target.value)}
                                                                                onBlur={() => commitEdit(i, 'ot')}
                                                                                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditingCell(null) }}
                                                                                className="w-16 text-right border border-blue-400 rounded px-1 py-0 text-sm bg-blue-50 focus:outline-none" />
                                                                        ) : (
                                                                            <span className="cursor-pointer hover:ring-1 hover:ring-blue-300 rounded px-1" title="Click Ä‘á»ƒ sá»­a"
                                                                                onClick={() => { setEditingCell({ row: i, field: 'ot' }); setEditDraft(r.ot) }}>
                                                                                {r.ot && r.ot !== '0' && r.ot !== '' ? (
                                                                                    <>{r.ot}<span className="text-muted-foreground ml-0.5">({OT_HOUR[r.shift] ?? ''})</span></>
                                                                                ) : <span className="text-muted-foreground">â€”</span>}
                                                                            </span>
                                                                        )}
                                                                    </td>
                                                                    {/* Chay â€” editable */}
                                                                    <td className="px-3 py-2.5 text-right">
                                                                        {editingCell?.row === i && editingCell?.field === 'vegetarian' ? (
                                                                            <input autoFocus type="number" value={editDraft}
                                                                                onChange={e => setEditDraft(e.target.value)}
                                                                                onBlur={() => commitEdit(i, 'vegetarian')}
                                                                                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditingCell(null) }}
                                                                                className="w-16 text-right border border-blue-400 rounded px-1 py-0 text-sm bg-blue-50 focus:outline-none" />
                                                                        ) : (
                                                                            <span className={`cursor-pointer hover:ring-1 hover:ring-blue-300 rounded px-1 ${r.vegetarian != null && r.vegetarian > 0 ? 'font-semibold text-emerald-600' : 'text-muted-foreground'}`}
                                                                                title="Click Ä‘á»ƒ sá»­a"
                                                                                onClick={() => { setEditingCell({ row: i, field: 'vegetarian' }); setEditDraft(String(r.vegetarian ?? '')) }}>
                                                                                {r.vegetarian != null && r.vegetarian > 0 ? r.vegetarian : 'â€”'}
                                                                            </span>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-3 py-2.5">
                                                                        {linked ? (
                                                                            <span className="inline-flex items-center gap-1 text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">
                                                                                <Database className="h-3 w-3" />
                                                                                {linked.name_en}
                                                                            </span>
                                                                        ) : isUnknown ? (
                                                                            <div className="flex flex-col gap-1 min-w-[150px]">
                                                                                <span className="text-xs text-amber-600 font-semibold">âš  KhÃ´ng rÃµ: &quot;{effArea}&quot;</span>
                                                                                <select
                                                                                    className="text-xs border border-amber-300 rounded px-1 py-0.5 bg-amber-50 focus:outline-none focus:ring-1 focus:ring-amber-400"
                                                                                    value={areaOverrides[i] ?? ""}
                                                                                    onChange={(e) => setAreaOverrides(prev => ({ ...prev, [i]: e.target.value }))}
                                                                                >
                                                                                    <option value="">-- Chá»n bá»™ pháº­n --</option>
                                                                                    {deptList.map(d => (
                                                                                        <option key={d.id} value={d.name_en}>{d.name_en}</option>
                                                                                    ))}
                                                                                </select>
                                                                            </div>
                                                                        ) : (
                                                                            <span className="text-xs text-muted-foreground">â€”</span>
                                                                        )}
                                                                    </td>
                                                                    {/* Source toggle */}
                                                                    <td className="px-2 py-2 text-center">
                                                                        {r.raw ? (
                                                                            <button type="button"
                                                                                onClick={() => toggleSource(i)}
                                                                                title="Xem nguá»“n"
                                                                                className={`text-xs px-1.5 py-0.5 rounded border transition-colors ${expandedSource.has(i)
                                                                                    ? 'bg-slate-200 border-slate-400 text-slate-700'
                                                                                    : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                                                                                    }`}
                                                                            >
                                                                                {expandedSource.has(i) ? 'â–² áº¨n' : 'â–¼ Xem'}
                                                                            </button>
                                                                        ) : <span className="text-muted-foreground text-xs">â€”</span>}
                                                                    </td>
                                                                    {/* Per-row confirm */}
                                                                    <td className="px-2 py-2 text-center">
                                                                        {canSave && (
                                                                            confirmedRows.has(i) ? (
                                                                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                                                                                    <CheckCircle2 className="h-3 w-3" /> ÄÃ£ lÆ°u
                                                                                </span>
                                                                            ) : (
                                                                                <button type="button"
                                                                                    onClick={() => handleConfirmOne(i)}
                                                                                    disabled={confirmingRow === i}
                                                                                    className="text-xs font-semibold px-2.5 py-0.5 rounded-full border bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-600 hover:text-white transition-colors disabled:opacity-50"
                                                                                >
                                                                                    {confirmingRow === i ? '...' : 'âœ“ LÆ°u'}
                                                                                </button>
                                                                            )
                                                                        )}
                                                                        {confirmMsg[i] && !confirmedRows.has(i) && (
                                                                            <div className={`text-[10px] mt-0.5 ${confirmMsg[i].type === 'ok' ? 'text-emerald-600' : 'text-red-500'
                                                                                }`}>{confirmMsg[i].text}</div>
                                                                        )}
                                                                    </td>
                                                                </tr>
                                                                {/* Expandable source row */}
                                                                {expandedSource.has(i) && r.raw && (
                                                                    <tr className="bg-slate-50 border-b border-slate-100">
                                                                        <td colSpan={13} className="px-4 py-2">
                                                                            <div className="flex items-start gap-2">
                                                                                <span className="text-[10px] font-bold uppercase text-slate-400 mt-0.5 shrink-0">Nguá»“n:</span>
                                                                                <pre className="text-xs text-slate-600 whitespace-pre-wrap font-mono bg-white border border-slate-200 rounded-lg px-3 py-2 flex-1 leading-relaxed">{r.raw}</pre>
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                )}
                                                            </>
                                                        )
                                                    })}
                                                </tbody>
                                                <tfoot>
                                                    <tr className="bg-muted/60 font-bold border-t-2 text-sm">
                                                        <td className="px-3 py-2.5" colSpan={4}>
                                                            Tá»”NG ({records.length} khu vá»±c)
                                                        </td>
                                                        <td className="px-3 py-2.5 text-right text-green-700">{summary.totalOfficial}</td>
                                                        <td className="px-3 py-2.5 text-right text-red-600">{summary.totalAbsent}</td>
                                                        <td className="px-3 py-2.5 text-right">{summary.totalSeasonal}</td>
                                                        <td className="px-3 py-2.5 text-right">â€”</td>
                                                        <td className="px-3 py-2.5 text-right">â€”</td>
                                                        <td className="px-3 py-2.5 text-right text-emerald-600">
                                                            {summary.totalVeg > 0 ? summary.totalVeg : "â€”"}
                                                        </td>
                                                        <td />
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                    </div>
                                )}

                                {/* Back button */}
                                <div className="flex justify-start">
                                    <Button variant="ghost" size="sm" onClick={handleReset} className="gap-2 text-muted-foreground">
                                        <RefreshCw className="h-3 w-3" /> Paste dá»¯ liá»‡u má»›i
                                    </Button>
                                </div>
                            </>
                        )}
                    </>
                )}

                {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
                {/* TAB 2: HISTORY                              */}
                {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
                {activeTab === "history" && (() => {
                    // Build pivot from historyRecords
                    // rows: deptÃ—shift, cols: dates
                    const pivotDays = [...new Set(historyRecords.map(r => r.work_date))].sort()
                    type PivotKey = string // `${dept_id|dept_name}|${shift}`
                    const pivotMap = new Map<PivotKey, { deptCode: string; deptName: string; shift: string; days: Map<string, { present: number; ot: number; veg: number }> }>()
                    historyRecords.forEach(r => {
                        const deptCode = deptList.find(d => d.id === r.department_id)?.code ?? ''
                        const deptName = DEPT_DISPLAY[deptCode]
                            ?? (r.department_id ? (deptList.find(d => d.id === r.department_id)?.name_en ?? r.department_name) : r.department_name)
                        const key: PivotKey = `${r.department_id ?? r.department_name}|${r.shift}`
                        if (!pivotMap.has(key)) pivotMap.set(key, { deptCode, deptName, shift: r.shift, days: new Map() })
                        pivotMap.get(key)!.days.set(r.work_date, {
                            present: Math.max((r.official_present ?? 0) + (r.seasonal_present ?? 0), r.vegetarian ?? 0),
                            ot: r.ot_count ?? 0,
                            veg: r.vegetarian ?? 0,
                        })
                    })
                    // Sort rows by DEPT_ORDER then shift
                    const pivotRows = [...pivotMap.entries()].sort(([, a], [, b]) => {
                        const ai = DEPT_ORDER.indexOf(a.deptCode); const bi = DEPT_ORDER.indexOf(b.deptCode)
                        if (ai !== bi) return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi)
                        return SHIFT_ORDER.indexOf(a.shift) - SHIFT_ORDER.indexOf(b.shift)
                    })

                    return (
                        <div className="space-y-4">
                            {/* Filter bar */}
                            <div className="bg-card rounded-xl border shadow-sm p-4">
                                <div className="flex flex-wrap items-end gap-3">
                                    <div>
                                        <label className="text-xs font-semibold text-muted-foreground block mb-1">Tá»« ngÃ y</label>
                                        <input type="date" value={historyFrom}
                                            onChange={e => setHistoryFrom(e.target.value)}
                                            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                                    </div>
                                    <div>
                                        <label className="text-xs font-semibold text-muted-foreground block mb-1">Äáº¿n ngÃ y</label>
                                        <input type="date" value={historyTo}
                                            onChange={e => setHistoryTo(e.target.value)}
                                            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                                    </div>
                                    {/* Quick-pick buttons */}
                                    <div className="flex gap-1.5" style={{ paddingBottom: '0px' }}>
                                        {([
                                            { label: '7 ngÃ y', days: 6 },
                                            { label: '14 ngÃ y', days: 13 },
                                            { label: '30 ngÃ y', days: 29 },
                                        ] as { label: string; days: number }[]).map(opt => {
                                            const to = new Date().toISOString().slice(0, 10)
                                            const from = (() => { const d = new Date(); d.setDate(d.getDate() - opt.days); return d.toISOString().slice(0, 10) })()
                                            const active = historyFrom === from && historyTo === to
                                            return (
                                                <button type="button" key={opt.label}
                                                    onClick={() => { setHistoryFrom(from); setHistoryTo(to) }}
                                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${active ? 'bg-primary text-white border-primary' : 'bg-background text-muted-foreground border-input hover:bg-muted'
                                                        }`}>
                                                    {opt.label}
                                                </button>
                                            )
                                        })}
                                    </div>
                                    <Button onClick={fetchHistory} disabled={historyLoading} className="gap-2">
                                        <CalendarDays className="h-4 w-4" />
                                        {historyLoading ? 'Äang táº£i...' : 'Xem dá»¯ liá»‡u'}
                                    </Button>
                                    {historyRecords.length > 0 && (
                                        <Button variant="outline" onClick={() => exportHistoryCSV(historyRecords)}
                                            className="gap-2 text-green-700 border-green-300 hover:bg-green-50">
                                            <FileSpreadsheet className="h-4 w-4" />
                                            Xuáº¥t CSV
                                        </Button>
                                    )}
                                </div>
                            </div>

                            {/* Pivot table */}
                            {historyLoading ? (
                                <div className="text-center py-12 text-muted-foreground">
                                    <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-3" />
                                    Äang táº£i dá»¯ liá»‡u...
                                </div>
                            ) : historyRecords.length === 0 ? (
                                <div className="bg-muted/30 rounded-xl border p-8 text-center text-muted-foreground">
                                    <Database className="h-10 w-10 mx-auto mb-3 opacity-40" />
                                    <p className="font-medium">ChÆ°a cÃ³ dá»¯ liá»‡u trong khoáº£ng thá»i gian nÃ y</p>
                                    <p className="text-sm mt-1">Paste dá»¯ liá»‡u Zalo á»Ÿ tab &quot;Nháº­p &amp; PhÃ¢n tÃ­ch&quot; rá»“i báº¥m LÆ°u vÃ o DB</p>
                                </div>
                            ) : (
                                <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
                                    <div className="px-4 py-3 border-b bg-muted/40 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <History className="h-4 w-4 text-muted-foreground" />
                                            <span className="font-semibold text-sm">
                                                Lá»‹ch sá»­ â€” {pivotDays.length} ngÃ y Â· {pivotRows.length} bá»™ pháº­n/ca
                                            </span>
                                        </div>
                                        <span className="text-xs text-muted-foreground">Sá»‘ liá»‡u: ChÃ­nh thá»©c + Thá»i vá»¥ hiá»‡n diá»‡n</span>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="text-xs min-w-full">
                                            <thead>
                                                <tr className="bg-muted/60 text-muted-foreground">
                                                    <th className="px-3 py-2 text-left font-semibold sticky left-0 bg-muted/60 min-w-[120px]">Bá»™ pháº­n</th>
                                                    <th className="px-2 py-2 text-center font-semibold sticky left-[120px] bg-muted/60 min-w-[44px]">Ca</th>
                                                    {pivotDays.map(d => (
                                                        <th key={d} className="px-2 py-2 text-center font-semibold min-w-[42px] whitespace-nowrap">
                                                            {parseInt(d.slice(8), 10)}/{parseInt(d.slice(5, 7), 10)}
                                                        </th>
                                                    ))}
                                                    <th className="px-2 py-2 text-center font-bold min-w-[48px] text-primary">Tá»”NG</th>
                                                    {canEdit && <th className="px-2 py-2 text-center font-semibold text-muted-foreground min-w-[72px]">Edit / Delete</th>}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y">
                                                {pivotRows.map(([key, row]) => {
                                                    const rowTotal = [...row.days.values()].reduce((s, v) => s + v.present, 0)
                                                    const hasData = rowTotal > 0
                                                    return (
                                                        <tr key={key} className={`transition-colors hover:bg-muted/30 ${!hasData ? 'opacity-40' : ''}`}>
                                                            <td className="px-3 py-2 font-medium sticky left-0 bg-card whitespace-nowrap border-r">{row.deptName}</td>
                                                            <td className="px-2 py-2 text-center sticky left-[120px] bg-card border-r">
                                                                <span className="inline-block bg-blue-100 text-blue-700 text-xs font-semibold px-1.5 py-0.5 rounded-full">{row.shift}</span>
                                                            </td>
                                                            {pivotDays.map(d => {
                                                                const cell = row.days.get(d)
                                                                const n = cell?.present ?? 0
                                                                return (
                                                                    <td key={d} className="px-2 py-2 text-center">
                                                                        {n > 0 ? (
                                                                            <span className="font-bold text-green-700">{n}</span>
                                                                        ) : <span className="text-muted-foreground/40">â€”</span>}
                                                                    </td>
                                                                )
                                                            })}
                                                            <td className="px-2 py-2 text-center font-bold text-primary border-l">{rowTotal || 'â€”'}</td>
                                                            {canEdit && (
                                                                <td className="px-2 py-2 text-center">
                                                                    <div className="flex items-center justify-center gap-1">
                                                                        {/* Edit: go to kitchen tab for the latest date of this row */}
                                                                        <button type="button"
                                                                            onClick={() => {
                                                                                // Find the most recent date that has data for this row
                                                                                const latestDay = [...row.days.entries()]
                                                                                    .filter(([, v]) => v.present > 0)
                                                                                    .sort(([a], [b]) => b.localeCompare(a))[0]?.[0]
                                                                                if (latestDay) {
                                                                                    setSummaryDate(latestDay)
                                                                                    setSummaryShift(row.shift === 'OT' ? '1' : row.shift)
                                                                                }
                                                                                setActiveTab('kitchen')
                                                                            }}
                                                                            className="text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded px-1.5 py-0.5 text-xs transition-colors"
                                                                            title="Sá»­a sá»‘ liá»‡u"
                                                                        >
                                                                            âœï¸
                                                                        </button>
                                                                        {/* Delete */}
                                                                        <button type="button"
                                                                            onClick={async () => {
                                                                                if (!confirm(`XÃ³a Táº¤T Cáº¢ báº£n ghi cá»§a "${row.deptName}" Ca ${row.shift} trong khoáº£ng ngÃ y Ä‘Ã£ chá»n?`)) return
                                                                                const ids = historyRecords
                                                                                    .filter(r => (r.department_id ?? r.department_name) + '|' + r.shift === key)
                                                                                    .map(r => r.id)
                                                                                const errors: string[] = []
                                                                                for (const id of ids) {
                                                                                    const res = await fetch(`/api/meal-headcount?id=${id}`, { method: 'DELETE' })
                                                                                    if (!res.ok) {
                                                                                        const json = await res.json().catch(() => ({}))
                                                                                        errors.push(json.error || res.statusText)
                                                                                    }
                                                                                }
                                                                                if (errors.length > 0) {
                                                                                    alert("LÃ¡Â»â€”i xÃƒÂ³a: " + errors.join("; "))
                                                                                    return
                                                                                }
                                                                                setHistoryRecords(prev => prev.filter(r => !ids.includes(r.id)))
                                                                            }}
                                                                            className="text-red-400 hover:text-red-600 hover:bg-red-50 rounded px-1.5 py-0.5 text-xs transition-colors"
                                                                            title="XÃ³a hÃ ng nÃ y"
                                                                        >
                                                                            ðŸ—‘
                                                                        </button>
                                                                    </div>
                                                                </td>
                                                            )}
                                                        </tr>
                                                    )
                                                })}
                                            </tbody>
                                            <tfoot>
                                                <tr className="bg-muted/60 font-bold border-t-2">
                                                    <td colSpan={2} className="px-3 py-2 sticky left-0 bg-muted/60">Tá»”NG NGÃ€Y</td>
                                                    {pivotDays.map(d => {
                                                        const total = historyRecords
                                                            .filter(r => r.work_date === d)
                                                            .reduce((s, r) => s + (r.official_present ?? 0) + (r.seasonal_present ?? 0), 0)
                                                        return <td key={d} className="px-2 py-2 text-center text-primary">{total || 'â€”'}</td>
                                                    })}
                                                    <td className="px-2 py-2 text-center text-primary border-l">
                                                        {historyRecords.reduce((s, r) => s + (r.official_present ?? 0) + (r.seasonal_present ?? 0), 0)}
                                                    </td>
                                                    {canEdit && <td />}
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                })()}

            </div>
        </>
    )
}



