"use client"

import { useState, useCallback, useEffect, Fragment } from "react"
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

// Ca → giờ bắt đầu (cho OT hint)
const SHIFT_HOUR: Record<string, string> = { "1": "6h", "2": "14h", "3": "22h" }
// OT meal time: Ca 1 OT → ăn 14h · Ca 2 OT → ăn 18h
const OT_HOUR: Record<string, string> = { "1": "14h", "2": "18h", "3": "6h" }

// Các bộ phận cần báo cơm theo code trong DB
const EXPECTED_DEPTS = [
    "PEEL", "CS", "STEAM", "PACK", "BORMA", "SHELL", "BOILER", "QC", "FGWH", "HPEEL", "MAINT_SHELL", "MAINT_HCA", "OFFICE", "CLEAN"
]
// These depts only work Ca 1 — no need to report Ca 2 / Ca 3
const CA1_ONLY_DEPTS = new Set(["FGWH", "OFFICE"])

// ─────────────────────────────────────────────
// Billing cycle helper: chọn tháng M/YYYY → chu kỳ 26/(M-1) → 25/M
// ─────────────────────────────────────────────
function getBillingCycle(monthStr: string): { from: string; to: string; label: string } {
    // monthStr = "YYYY-MM"
    const [year, month] = monthStr.split("-").map(Number)
    // Start: ngày 26 tháng trước
    const prevMonth = month === 1 ? 12 : month - 1
    const prevYear = month === 1 ? year - 1 : year
    const from = `${prevYear}-${String(prevMonth).padStart(2, "0")}-26`
    // End: ngày 25 tháng hiện tại
    const to = `${year}-${String(month).padStart(2, "0")}-25`
    // Human label: "26/MM-1/YYYY → 25/MM/YYYY"
    const label = `26/${String(prevMonth).padStart(2, "0")}/${prevYear} → 25/${String(month).padStart(2, "0")}/${year}`
    return { from, to, label }
}

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
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
    vegetarian: number | null
}

// Department mapping: Zalo name hoặc tên Excel → DB department code
// Tên Excel chính xác từ file "Báo Cơm 2026" được giữ nguyên
const DEPT_MAP: Record<string, string> = {
    // ── LOADING / WH (làm việc tại FGWH và RCN) ──
    "loading s1": "FGWH",
    "loading s2": "FGWH",
    "loading s3": "FGWH",
    "loading": "FGWH",
    "warehouse": "FGWH",
    "wh": "FGWH",
    "fgwh": "FGWH",
    "rcn": "FGWH",
    // ── STEAMING ──
    "steaming s1": "STEAM",
    "steaming s2": "STEAM",
    "steaming s3": "STEAM",
    "steaming": "STEAM",
    // ── SHELLING ──
    "shelling s1": "SHELL",
    "shelling thời vụ s1": "SHELL",
    "shelling s2": "SHELL",
    "shelling thời vụ s2": "SHELL",
    "shelling s3": "SHELL",
    "shelling thời vụ s3": "SHELL",
    "shelling": "SHELL",
    // ── MAINTENANCE SHELLING ──
    "maintenance shelling s1": "MAINT_SHELL",
    "maintenance shelling s2": "MAINT_SHELL",
    "maintenance shelling s3": "MAINT_SHELL",
    "maintenance shelling": "MAINT_SHELL",
    "maint shelling": "MAINT_SHELL",
    "maint - shelling": "MAINT_SHELL",
    "bảo trì shelling": "MAINT_SHELL",
    "bao tri shelling": "MAINT_SHELL",
    "bảo trì máy cắt": "MAINT_SHELL",
    "bao tri may cat": "MAINT_SHELL",
    "bảo trì may cắt": "MAINT_SHELL",
    "bao tri máy cắt": "MAINT_SHELL",
    // ── BORMA ──
    "borma s1": "BORMA",
    "borma thời vụ s1": "BORMA",
    "borma s2": "BORMA",
    "borma thời vụ s2": "BORMA",
    "borma s3": "BORMA",
    "borma thời vụ s3": "BORMA",
    "borma": "BORMA",
    // ── PEELING MACHINE (Peeling Mc) ──
    "peeling s1": "PEEL",
    "peeling thời vụ s1": "PEEL",
    "peeling s2": "PEEL",
    "peeling thời vụ s2": "PEEL",
    "peeling s3": "PEEL",
    "peeling thời vụ s3": "PEEL",
    "peeling": "PEEL",
    "peeling mc": "PEEL",
    "mc peeling": "PEEL",
    // ── COLOR SORTER (Machine Grading) ──
    "machine grading - shift 1": "CS",
    "machine grading  - thời vụ 1": "CS",
    "machine grading  - shift 2": "CS",
    "machine grading  thời vụ - shift 2": "CS",
    "machine grading  - shift 3": "CS",
    "machine grading  thời vụ- shift 3": "CS",
    "machine grading": "CS",
    "machine grading shift 1": "CS",
    "machine grading shift 2": "CS",
    "machine grading shift 3": "CS",
    "color sorter": "CS",
    // ── HANDPEELING — all sub-groups merged to HPEEL ──
    // Canonical names (new format in DB)
    "hand peeling s1": "HPEEL",
    "hand peeling s2": "HPEEL",
    "hand peeling s3": "HPEEL",
    // Legacy formats still being entered via Zalo/AI
    "manual grading -shift 1 (ms huệ)": "HPEEL",
    "manual grading -shift 2 (ms huệ)": "HPEEL",
    "manual grading -shift 3 (ms huệ)": "HPEEL",
    "manual grading thời vụ -shift 1 (ms huệ)": "HPEEL",
    "manual grading thời vụ -shift 2 (ms huệ)": "HPEEL",
    "manual grading thời vụ -shift 3 (ms huệ)": "HPEEL",
    "manual grading (ms huệ)": "HPEEL",
    "manual grading (ms hue)": "HPEEL",
    "manual grading": "HPEEL",
    "manual peeling s1 - liên": "HPEEL",
    "manual peeling s1 - dung": "HPEEL",
    "manual peeling s2 - liên": "HPEEL",
    "manual peeling s2 - dung": "HPEEL",
    "manual peeling s3 - liên": "HPEEL",
    "manual peeling s3 - dung": "HPEEL",
    "manual peeling s1 thời vụ - liên": "HPEEL",
    "manual peeling s1 thời vụ - dung": "HPEEL",
    "manual peeling s2 thời vụ - liên": "HPEEL",
    "manual peeling s2 thời vụ - dung": "HPEEL",
    "manual peeling s3 thời vụ - liên": "HPEEL",
    "manual peeling s3 thời vụ - dung": "HPEEL",
    "manual peeling (dung)": "HPEEL",
    "manual peeling (liên)": "HPEEL",
    "manual peeling (lien)": "HPEEL",
    "manual peeling": "HPEEL",
    "handpeeling": "HPEEL",
    // Zalo aliases
    "grading": "HPEEL",
    "gradin": "HPEEL",

    // ── PACKING ──
    "packing s1": "PACK",
    "packing thời vụ s1": "PACK",
    "packing s2": "PACK",
    "packing thời vụ s2": "PACK",
    "packing s3": "PACK",
    "packing": "PACK",
    // ── BOILER ──
    "boiler worker s1": "BOILER",
    "boiler worker s2": "BOILER",
    "boiler worker s3": "BOILER",
    "boiler worker": "BOILER",
    "boiler": "BOILER",
    // ── MAINTENANCE HIGHCARE ──
    "maintenance s1": "MAINT_HCA",
    "maintenance s2": "MAINT_HCA",
    "maintenance s3": "MAINT_HCA",
    "maintenance": "MAINT_HCA",
    "maint hca": "MAINT_HCA",
    "maint highcare": "MAINT_HCA",
    "maintenance highcare": "MAINT_HCA",
    "maint - highcare": "MAINT_HCA",
    "maint-highcare": "MAINT_HCA",
    "bảo trì highcare": "MAINT_HCA",
    "bao tri highcare": "MAINT_HCA",
    "bảo trì hca": "MAINT_HCA",
    "bao tri hca": "MAINT_HCA",
    "highcare maint": "MAINT_HCA",
    "highcare maintenance": "MAINT_HCA",
    // ── QC ──
    "qc": "QC",
    "qc s2": "QC",
    "qc s3": "QC",
    // ── TẬ P VỤ (Cleaning) ──
    "tập vụ": "CLEAN", "tạp vụ": "CLEAN", "tap vu": "CLEAN", "cleaning": "CLEAN",
    // Handpeeling + supervisor name aliases (shift resolved at save time)
    "handpeeling (dung)": "HPEEL_DUNG",
    "handpeeling (liên)": "HPEEL_LIEN", "handpeeling (lien)": "HPEEL_LIEN",
    // ── OFFICE ──
    "office": "OFFICE",
    "văn phòng": "OFFICE",
    "van phong": "OFFICE",
    "vp": "OFFICE",
    "office staff": "OFFICE",
    "staff": "OFFICE",
    // ── Fallback: AI may return the DB code directly (e.g. "STEAM", "PEEL", "HPEEL") ──
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
    HPEEL_LIEN:    'Manual Peeling (Li\u00ean)',
    HPEEL_DUNG:    'Manual Peeling (Dung)',
}
// Virtual sub-group codes mapping to HPEEL department_id
const HPEEL_SUBCODES = new Set(["HPEEL_GRADING", "HPEEL_LIEN", "HPEEL_DUNG"])

// ─────────────────────────────────────────────
// Parse helpers
// ─────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// HPEEL supervisor-name → sub-group detector
// Call ONLY when area is generic HPEEL/handpeeling/manual peeling/grading.
// Returns a DEPT_MAP key that already maps to the correct HPEEL_* sub-code,
// or null if no supervisor name found.
// ─────────────────────────────────────────────────────────────────────────────
function detectHpeelSubgroup(blockText: string, hint: string): string | null {
    // Combine block + senderHint for fuzzy matching
    const raw = (blockText + ' ' + hint).toLowerCase()
    // Ms Huệ → Manual Grading (Huệ)
    if (/ms\.?\s*hu[eệ]|ch[aá]u\s+hu[eệ]|em\s+hu[eệ]|\bhu[eệ]\b/.test(raw)) {
        return 'manual grading -shift 1 (ms huệ)'   // maps to HPEEL_GRADING
    }
    // Liên → HPEEL_LIEN
    if (/\bli[êẻn]\b/.test(raw)) {
        return 'manual peeling s1 - liên'            // maps to HPEEL_LIEN
    }
    // Dung → HPEEL_DUNG
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

    const dateRaw = getField(text, ["date", "ngày", "deate", "ngay"])
    let dateVal = normalizeDate(dateRaw)
    if (!dateVal) {
        const inlineDate = text.match(/\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b/)
        if (inlineDate) dateVal = normalizeDate(inlineDate[0])
    }

    const hasKeyword = /khu\s*v[ựu]c|chính\s*th[ứu]c|ca\s*:/i.test(text)
    if (!dateVal && !hasKeyword) return null

    let area = getField(text, ["khu vực", "khu vuc", "bộ phận", "bo phan", "bộphận"])
    area = area.replace(/\s*ca\s*:\s*\w+.*/i, "").trim()
    // Strip trailing parenthetical hints like "(Dung)", "(Linh)", etc.
    area = area.replace(/\s*\([^)]*\)\s*$/, "").trim()
    // Strip trailing comma or punctuation
    area = area.replace(/[,;.]+$/, "").trim()
    // Fallback: if no "Khu vực:" label found, use the first non-date non-keyword line
    // e.g. "Machine Grading - ca2" as first line → area="Machine Grading", shift="2"
    if (!area) {
        const firstMeaningfulLine = text.split('\n').find(l => {
            const t = l.trim()
            // Skip: empty, bullet/dash lines, lines with colons (are field labels), dates
            return t.length > 2
                && !/^[-–•]/.test(t)
                && !t.includes(':')
                && !/^(date|ngày|ngay|chính|thời|ot|dự|trong đó)/i.test(t)
                && !/^\d{1,2}[./]/.test(t)
        })
        if (firstMeaningfulLine) {
            // Strip " - caN" or " caN" suffix to get clean area
            area = firstMeaningfulLine.trim().replace(/\s*[-–]\s*ca\s*\d+/i, '').trim()
        }
    }

    let shift = getField(text, ["ca"])
    const inlineShift = getField(text, ["khu vực", "khu vuc"]).match(/ca\s*:\s*(\S+)/i)
    if (inlineShift) shift = inlineShift[1]
    shift = shift.replace(/\./g, ", ").trim()
    // Strip trailing descriptive text like "và HC", "và Highcare" after the shift number
    shift = shift.replace(/\s+và\s+.*/i, "").trim()
    // Keep only leading digits/commas/spaces (shift number part)
    const shiftOnlyMatch = shift.match(/^[\d,\s]+/)
    if (shiftOnlyMatch) shift = shiftOnlyMatch[0].trim()
    // Fallback: extract shift from "Dept - caN" on first line (e.g. "Machine Grading - ca2")
    // Also use this if shift resolved to something non-numeric (getField grabbed wrong line)
    if (!shift || !/^\d/.test(shift)) {
        const firstLineShift = text.split('\n')[0]?.match(/[-–]\s*ca\s*(\d+)/i)
        if (firstLineShift) shift = firstLineShift[1]
    }


    // Fuzzy match: ch[íi]nh th[ứu]c hi[eệ]n di[eệ]n (any diacritic mix)
    const offPresentFuzzy = text.match(/ch[íi]nh\s+th[ứu]c\s+hi[eệ]n\s+di[eệ]n\s*:?\s*([^\n]*)/i)
    let offPresentRaw = offPresentFuzzy ? offPresentFuzzy[1].trim() : getField(text, [
        "chính thức hiện diện", "chính thuc hiện diện", "chinh thuc hien dien",
    ])
    // Fallback: bare "Chính thức N" without hiện diện
    if (!offPresentRaw) {
        const bareMatch = text.match(/ch[íi]nh\s+th[ứu]c\s*:?\s*(\d[^\n]*)/i)
        if (bareMatch) offPresentRaw = bareMatch[1].trim()
    }
    const { total: officialPresent, vegetarian, note: offNote } = extractNumber(offPresentRaw)

    let offAbsentRaw = getField(text, ["chính thức vắng", "chinh thuc vang"])
    // Fallback: bare "Vắng N" (without "chính thức" prefix) — only when no other vang label found
    if (!offAbsentRaw) {
        // Tìm dòng chứa "vắng" không có prefix thời vụ
        const bareVangMatch = text.match(/(?<!thời\s+vụ\s+)vắng\s*:?\s*(\d[^\n]*)/i)
        if (bareVangMatch) offAbsentRaw = bareVangMatch[1].trim()
    }
    const { total: officialAbsent } = extractNumber(offAbsentRaw)

    const seasPresentRaw = getField(text, ["thời vụ hiện diện", "2thời vụ hiện diện", "thoi vu hien dien"])
    const { total: seasonalPresent } = extractNumber(seasPresentRaw)

    const seasAbsentRaw = getField(text, ["thời vụ vắng", "thoi vu vang"])
    const { total: seasonalAbsent } = extractNumber(seasAbsentRaw)

    // OT: grab only the leading number/token (stop before any next keyword or whitespace-separated text)
    let otRaw = getField(text, ["ot"])
    // Trim away anything after the first number + optional symbol (e.g. "0 Dự trù ngày ...")
    const otNumMatch = otRaw.match(/^(\d+[h]?(?:\.\d+)?(?:\s*giờ|\s*h)?)/i)
    let ot = otNumMatch ? otNumMatch[1].trim() : (otRaw.split(/\s{2,}|(?=d[ựu]\s*tr[ùu])|(?=ca\s*:)/i)[0] || otRaw).trim()
    // Dự trù (forecast) is intentionally ignored — trailing info after OT is skipped

    let vegTotal = vegetarian
    const vegInOT = ot.match(/(\d+)\s*[p]?\s*[(\[]?\s*(\d+)\s*chay/i)
    if (!vegTotal && vegInOT) vegTotal = parseInt(vegInOT[2])
    const otVegMatch = ot.match(/(\d+)\s*chay/i)
    if (!vegTotal && otVegMatch) vegTotal = parseInt(otVegMatch[1])
    // Fallback: scan line by line for "- Chay: N" or "Chay: N" (from "Trong đó:" block)
    if (!vegTotal) {
        for (const ln of text.split('\n')) {
            const t = ln.trim().replace(/^[-–•]\s*/, '')  // strip leading bullet
            const m = t.match(/^chay\s*:\s*(\d+)/i)
            if (m) { vegTotal = parseInt(m[1]); break }
        }
    }



    const lines = text.split("\n")
    let senderHint = ""
    for (const line of lines) {
        const l = line.trim()
        if (l && !/khu\s*v[ựu]c|ca\s*:|chính|thời|date|ngày|deate|ot:|dự/i.test(l)) {
            if (!/^\d{1,2}[./]/.test(l) && l.length < 60) {
                senderHint = l
                break
            }
        }
    }

    // ── Refine generic HPEEL area using supervisor name (Huệ/Liên/Dung) ────────
    const _areaKey = (area || '').toLowerCase().trim()
    const _areaCode = DEPT_MAP[_areaKey]
    if (!_areaCode || _areaCode === 'HPEEL' || HPEEL_GENERIC_AREAS.has(_areaKey)) {
        const refined = detectHpeelSubgroup(text, senderHint)
        if (refined) area = refined
    }

    return {
        senderHint,
        date: dateVal,
        area: area || "—",
        shift: shift || "—",
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
    //   HH:MM] ...copy2... HH:MM: ...copy3... HH:MM  →  HH:MM
    // Use lazy match; \1 anchors stops at the correct timestamp occurrence.
    text = text.replace(
        /(\d{1,2}:\d{2})\]([\s\S]+?)\1\s*:[\s\S]+?\1(?=\n|$)/g,
        '$1'
    )

    // Step 2: Remove remaining "] SENDER" orphan endings (messages without timestamp in bracket)
    //   Handles messages like: [MSG] MSG: MSG (single-line or short).
    text = text.replace(/\]\s*[^\n\[]+(?=\n|$)/g, '')

    // Step 3: Remove leading [ from each line that starts a message block
    text = text.replace(/^\[(?!Hình ảnh|Sticker|Video|File)/gm, '')

    // Step 4: Remove Zalo emoji/sticker reaction lines
    text = text.replace(/^\/-[a-zA-Z]+\s*$/gm, '')
    text = text.replace(/^[:\-]{0,2}[()><oOhH]+\s*$/gm, '').replace(/\n{3,}/g, '\n\n')

    return text
}

// ─── QC Compact format parser ─────────────────────────────────────────────
// Handles: "Bộ phận: QC\nCa1: 12 (1 chay) OT: 3\nCa2: 6 (2 chay)\nCa3: 4 OT: 2"
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
        const am = l.match(/(?:b[ộo]\s*ph[aậ]n|b[ộo]ph[aậ]n|khu\s*v[ựu]c)\s*:?\s*(.+)/i)
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
        const hasArea = /khu\s*v[ựu]c/i.test(trimmed)
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
// e.g. "Ca 1\nChính thức 8\nCa 2\nChính thức 1" → 2 sub-blocks each with inherited date+area
function splitMultiShiftBlock(block: string): string[] {
    const lines = block.split("\n")
    // Regex to detect a bare "Ca N" line (shift marker, N = 1/2/3)
    const IS_SHIFT_LINE = /^ca\s+([1-3])(?:\s|$|v[àa])/i

    // Collect header lines (date, area) — before first bare Ca line
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
        officialPresent:  div(record.officialPresent),
        officialAbsent:   div(record.officialAbsent),
        seasonalPresent:  div(record.seasonalPresent),
        seasonalAbsent:   div(record.seasonalAbsent),
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
            if (record && (record.date || record.area !== "—")) {
                // Expand "Ca: 1.2.3" into 3 records, headcount divided equally
                records.push(...expandMultiShiftRecord(record))
            }
        }
    }
    // Step 2: Dedup by (date+area+shift), keeping last occurrence
    return deduplicateRecords(records)
}

// ─────────────────────────────────────────────
// CSV Export
// ─────────────────────────────────────────────
function exportCSV(records: HeadcountRecord[]) {
    const headers = ["Ngày", "Khu vực", "Ca", "CT Hiện diện", "CT Vắng", "TV Hiện diện", "TV Vắng", "OT", "Chay"]
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
    const headers = ["Ngày", "Bộ phận", "Ca", "CT Hiện diện", "CT Vắng", "TV Hiện diện", "TV Vắng", "OT", "Chay", "Ghi chú"]
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

// Convert DD/MM/YYYY → YYYY-MM-DD for DB
function dateToISO(ddmmyyyy: string): string {
    const parts = ddmmyyyy.split("/")
    if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`
    return ddmmyyyy
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────
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

        // Handpeeling with supervisor → shift-specific dept in DB
        const isDung = /dung/i.test(lower)
        const isLien = /li[ênế]n/i.test(lower)
        const isHue = /hu[ệê]/i.test(lower)
        if ((isDung || isLien) && (lower.includes('handpeeling') || lower.includes('manual peeling') || lower.includes('peeling'))) {
            const sup = isDung ? 'Dung' : 'Liên'
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
        // Tập vụ → Cleaning dept by name
        if (/t[ạḥâ]p\s*v[ụu]/i.test(area)) {
            const dept = deptList.find(d => /clean/i.test(d.name_en) || /t[ạâ]p\s*v[ụu]/i.test(d.name_en))
            if (dept) return dept.id
        }
        return findDeptId(area)
    }
    const [saving, setSaving] = useState(false)
    const [saveMsg, setSaveMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null)
    const [deptList, setDeptList] = useState<{ id: string; code: string; name_en: string }[]>([])
    const [userRole, setUserRole] = useState("")

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
    // Refresh key: tăng lên mỗi khi kitchen tab thay đổi data → trigger re-fetch history
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
        }
        init()
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    const canEdit = ["hr_admin", "hse_admin", "admin"].includes(userRole)
    const canSave = canEdit

    // ─── Build summary text for kitchen ───
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
            const totalPresent = recs.reduce((s, r) => s + (r.officialPresent ?? 0) + (r.seasonalPresent ?? 0), 0)
            const totalVeg = recs.reduce((s, r) => s + (r.vegetarian ?? 0), 0)
            const totalOT = recs.reduce((s, r) => s + (parseInt(r.ot) || 0), 0)
            const man = totalPresent - totalVeg
            const otHour = OT_HOUR[shift] ?? ""
            let block = `Ngày ${date}\nCa ${shift}: tổng cộng ${man} phần mặn (chay: ${totalVeg} phần)`
            if (totalOT > 0) block += `\n${totalOT} OT (ăn lúc ${otHour})`
            lines.push(block)
        })
        return lines.join("\n\n")
    }

    // ─── Check if area has a DEPT_MAP rule ───
    const hasDeptRule = (area: string): boolean => {
        const key = area.toLowerCase().trim()
        return Object.prototype.hasOwnProperty.call(DEPT_MAP, key)
    }

    // ─── History edit / delete handlers ───
    const handleHistSave = async (id: string) => {
        const { error } = await supabase
            .from("meal_headcount")
            .update({
                official_present: histEditFields.official_present,
                official_absent: histEditFields.official_absent,
                seasonal_present: histEditFields.seasonal_present,
                seasonal_absent: histEditFields.seasonal_absent,
                ot_count: histEditFields.ot_count,
                vegetarian: histEditFields.vegetarian,
            })
            .eq("id", id)
        if (error) { alert("Lỗi: " + error.message); return }
        setHistoryRecords(prev => prev.map(r => r.id === id ? { ...r, ...histEditFields } : r))
        // Cập nhật luôn summaryData nếu đang hiển
        setSummaryData(prev => prev ? prev.map(r =>
            r.id === id ? { ...r, ...histEditFields } : r
        ) : prev)
        setHistEditId(null)
    }

    const handleHistDelete = async (id: string) => {
        if (!confirm("Xóa bản ghi này?")) return
        const { error } = await supabase.from("meal_headcount").delete().eq("id", id)
        if (error) { alert("Lỗi: " + error.message); return }
        setHistoryRecords(prev => prev.filter(r => r.id !== id))
        // Cập nhật luôn summaryData nếu đang hiển
        setSummaryData(prev => prev ? prev.filter(r => r.id !== id) : prev)
    }

    // ─── Monthly stats state ───
    const [statsMonth, setStatsMonth] = useState<string>(() => new Date().toISOString().slice(0, 7))
    const [statsData, setStatsData] = useState<MealStatRow[] | null>(null)
    const [statsLoading, setStatsLoading] = useState(false)
    const [statsError, setStatsError] = useState<string | null>(null)
    // Row-level edit mode state (monthly table)
    const [editingRowKey, setEditingRowKey] = useState<string | null>(null)
    const [rowEditDrafts, setRowEditDrafts] = useState<Record<string, string>>({})
    const [rowSaving, setRowSaving] = useState(false)

    const fetchMonthStats = async () => {
        setStatsLoading(true)
        setStatsError(null)
        setStatsData(null)
        try {
            // Chu kỳ tiền cơm: 26 tháng trước → 25 tháng hiện tại
            const { from, to } = getBillingCycle(statsMonth)
            const { data, error } = await supabase
                .from("meal_headcount")
                .select("id, work_date, department_id, department_name, shift, official_present, seasonal_present, ot_count, vegetarian")
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

    // Thứ tự bộ phận theo layout Excel
    const DEPT_ORDER = ['FGWH','STEAM','SHELL','MAINT_SHELL','BORMA','PEEL','CS','HPEEL','PACK','BOILER','MAINT_HCA','CLEAN','QC','OFFICE']
    const SHIFT_ORDER = ['1','2','3','OT']
    // Alias: these dept codes are merged into another group in the monthly report
    // HAND (HANDPEELING) contains sub-supervisors Liên/Dung → merge into HPEEL group
    const DEPT_CODE_ALIAS: Record<string, string> = { PEEL_MC: 'PEEL', HAND: 'HPEEL' }

    // Tên hiển thị đẹp như trong Excel
    const DEPT_DISPLAY: Record<string, string> = {
        FGWH:       'Loading',
        STEAM:      'Steaming',
        SHELL:      'Shelling',
        MAINT_SHELL:'Maintenance shelling',
        BORMA:      'Borma',
        PEEL:       'Peeling',
        CS:         'Machine Grading',
        HPEEL:      'Hand Peeling',
        PACK:       'Packing',
        BOILER:     'Boiler worker',
        MAINT_HCA:  'Maintenance',
        CLEAN:      'Cleaning worker',
        QC:         'QC',
        OFFICE:     'Office',
    }

    // Excel Section row order within each dept group
    const SECTION_ORDER: Record<string, string[]> = {
        FGWH:       ['Loading S1','Loading S2','Loading S3'],
        STEAM:      ['Steaming S1','Steaming S2','Steaming S3'],
        SHELL:      ['Shelling S1','Shelling thời vụ S1','Shelling S2','Shelling thời vụ S2','Shelling S3','Shelling thời vụ S3'],
        MAINT_SHELL:['Maintenance shelling S1','Maintenance shelling S2','Maintenance shelling S3'],
        BORMA:      ['Borma S1','Borma thời vụ S1','Borma S2','Borma thời vụ S2','Borma S3','Borma thời vụ S3'],
        PEEL:       ['Peeling S1','Peeling thời vụ S1','Peeling S2','Peeling thời vụ S2','Peeling S3','Peeling thời vụ S3'],
        CS:         ['Machine Grading - shift 1','Machine Grading  - thời vụ 1','Machine Grading  - shift 2','Machine Grading  thời vụ - shift 2','Machine Grading  - shift 3','Machine Grading  thời vụ- shift 3'],
        HPEEL:      ['Manual Grading -Shift 1 (Ms Huệ)','Manual Grading Thời vụ -Shift 1 (Ms Huệ)','Manual Grading -Shift 2 (Ms Huệ)','Manual Grading Thời vụ -Shift 2 (Ms Huệ)','Manual Grading -Shift 3 (Ms Huệ)','Manual Grading Thời vụ -Shift 3 (Ms Huệ)','Manual peeling S1 - Liên','Manual peeling S1 thời vụ - Liên','Manual peeling S1 - Dung','Manual peeling S1 thời vụ - Dung','Manual peeling S2 - Liên','Manual peeling S2 thời vụ - Liên','Manual peeling S2 - Dung','Manual peeling S2 thời vụ - Dung','Manual peeling S3 - Liên','Manual peeling S3 thời vụ - Liên','Manual peeling S3 - Dung','Manual peeling S3 thời vụ - Dung'],
        PACK:       ['Packing S1','Packing thời vụ S1','Packing S2','Packing thời vụ S2','Packing S3'],
        BOILER:     ['Boiler worker S1','Boiler worker S2','Boiler worker S3'],
        MAINT_HCA:  ['Maintenance S1','Maintenance S2','Maintenance S3'],
        CLEAN:      ['Cleaning worker S1','Cleaning worker S2','Cleaning worker S3'],
        QC:         ['QC S1','QC S2','QC S3'],
        OFFICE:     ['Office S1','Office S2','Office S3'],
    }

    type ShiftEntry = { deptKey: string; deptName: string; deptCode: string; shift: string; days: Map<string, number>; officialDays: Map<string, number>; seasonalDays: Map<string, number>; otDays: Map<string, number> }
    type DeptGroup  = { deptKey: string; name: string; code: string; shifts: ShiftEntry[]; sectionRows: SectionRow[] }
    // SectionRow: 1 row per department_name (the Excel "Section" name)
    type SectionRow = { sectionName: string; deptCode: string; shift: string; days: Map<string, number>; officialDays: Map<string, number>; seasonalDays: Map<string, number> }

    // Build pivot: group by department_name ("Section" in Excel)
    const buildMonthlyPivot = (rows: MealStatRow[]) => {
        // 1. All unique days sorted
        const days = [...new Set(rows.map(r => r.work_date))].sort()

        // Helper: normalize HPEEL non-canonical section names → canonical SECTION_ORDER name
        const normalizeHpeelSectionName = (name: string, shift: string): string => {
            const n = name.toLowerCase()
            const s = /^[123]$/.test(shift) ? shift : '1'
            // Ms Huệ / Grading → Manual Grading -Shift N (Ms Huệ)
            if (/hu[eệ]/i.test(n) || /grading/i.test(n)) {
                return `Manual Grading -Shift ${s} (Ms Huệ)`
            }
            // Liên → Manual peeling SN - Liên
            if (/li[êẻen]n/i.test(n)) {
                return `Manual peeling S${s} - Liên`
            }
            // Dung → Manual peeling SN - Dung
            if (/dung/i.test(n)) {
                return `Manual peeling S${s} - Dung`
            }
            // Generic hand peeling / manual peeling without supervisor → map to Liên (ca1 default)
            if (/hand.?peel|manual.?peel/i.test(n)) {
                return `Manual peeling S${s} - Liên`
            }
            return name
        }

        // 2. Map section_name → SectionRow
        const sectionMap = new Map<string, SectionRow>()
        rows.forEach(r => {
            let deptCode = deptList.find(d => d.id === r.department_id)?.code ?? ''
            deptCode = DEPT_CODE_ALIAS[deptCode] ?? deptCode  // merge PEEL_MC → PEEL
            let sectionName = r.department_name   // e.g. "Loading S1", "Shelling S2"
            const shift = r.shift ?? '1'
            // Normalize: if sectionName is not a known section for this dept (e.g. kitchen tab saves
            // 'Shelling', 'STEAMING', 'FGWH' instead of canonical 'Shelling S2', 'Steaming S1',
            // 'Loading S1'), derive the proper section name from dept display name + shift
            const knownSections = SECTION_ORDER[deptCode] ?? []
            const isKnownSection = knownSections.some(s => s.toLowerCase() === sectionName.toLowerCase())
            if (!isKnownSection && deptCode) {
                if (deptCode === 'HPEEL') {
                    // For HPEEL: normalize to canonical section name based on supervisor clues
                    sectionName = normalizeHpeelSectionName(sectionName, shift)
                } else {
                    const displayName = DEPT_DISPLAY[deptCode] ?? sectionName
                    if (shift === 'OT') {
                        sectionName = `${displayName} OT`
                    } else {
                        sectionName = `${displayName} S${shift}`  // e.g. 'Loading S2', 'Shelling S2'
                    }
                }
            }
            // Total = official + seasonal (vegetarian is a SUBSET of official/seasonal, NOT additive)
            const total = (r.official_present ?? 0) + (r.seasonal_present ?? 0)
            // Only create section row if there is actual headcount data (skip zero-only records)
            if (total > 0) {
                const key = `${sectionName}|${shift}`
                if (!sectionMap.has(key)) sectionMap.set(key, {
                    sectionName, deptCode, shift,
                    days: new Map(), officialDays: new Map(), seasonalDays: new Map()
                })
                const e = sectionMap.get(key)!
                e.days.set(r.work_date, (e.days.get(r.work_date) ?? 0) + total)
                if ((r.official_present ?? 0) > 0)  e.officialDays.set(r.work_date, (e.officialDays.get(r.work_date) ?? 0) + (r.official_present ?? 0))
                if ((r.seasonal_present ?? 0) > 0)  e.seasonalDays.set(r.work_date, (e.seasonalDays.get(r.work_date) ?? 0) + (r.seasonal_present ?? 0))
            }
        })

        // 3. Build shift-level pivot (for OT) — same as before
        const shiftMap = new Map<string, ShiftEntry>()
        rows.forEach(r => {
            let deptCode  = deptList.find(d => d.id === r.department_id)?.code ?? ''
            deptCode = DEPT_CODE_ALIAS[deptCode] ?? deptCode  // merge PEEL_MC → PEEL
            const deptKey  = (DEPT_CODE_ALIAS[deptList.find(d => d.id === r.department_id)?.code ?? ''] ? deptList.find(d => d.code === deptCode)?.id : r.department_id) ?? r.department_id ?? r.department_name
            const deptName = DEPT_DISPLAY[deptCode] ?? r.department_name
            const shift = r.shift ?? '1'
            const mapKey = `${deptKey}|${shift}`
            if (!shiftMap.has(mapKey)) shiftMap.set(mapKey, { deptKey, deptName, deptCode, shift, days: new Map(), officialDays: new Map(), seasonalDays: new Map(), otDays: new Map() })
            const entry = shiftMap.get(mapKey)!
            // Total = official + seasonal (vegetarian is subset, NOT additive)
            const count = (r.official_present ?? 0) + (r.seasonal_present ?? 0)
            if (count > 0) entry.days.set(r.work_date, (entry.days.get(r.work_date) ?? 0) + count)
            if ((r.official_present ?? 0) > 0) entry.officialDays.set(r.work_date, (entry.officialDays.get(r.work_date) ?? 0) + (r.official_present ?? 0))
            if ((r.seasonal_present ?? 0) > 0) entry.seasonalDays.set(r.work_date, (entry.seasonalDays.get(r.work_date) ?? 0) + (r.seasonal_present ?? 0))
            // Route ot_count to a synthetic OT shift entry for this dept
            // (kitchen tab records store OT workers in ot_count alongside regular shifts)
            if ((r.ot_count ?? 0) > 0 && shift !== 'OT') {
                const otMapKey = `${deptKey}|OT`
                if (!shiftMap.has(otMapKey)) shiftMap.set(otMapKey, { deptKey, deptName, deptCode, shift: 'OT', days: new Map(), officialDays: new Map(), seasonalDays: new Map(), otDays: new Map() })
                const otEntry = shiftMap.get(otMapKey)!
                otEntry.days.set(r.work_date, (otEntry.days.get(r.work_date) ?? 0) + (r.ot_count ?? 0))
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
            const dg = deptGroupMap.get(sr.deptCode) ?? [...deptGroupMap.values()].find(g => g.code === sr.deptCode)
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
        const titleRow = [`TIỀN CƠM CÁN BỘ CÔNG NHÂN VIÊN THÁNG ${statsMonth}`]
        const periodRow = [`Từ ngày ${billingLabel}`]
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
        const totalRow = ['Total', ...days.map(d => deptGroups.reduce((s, dg) => s + dg.sectionRows.reduce((ss, sr) => ss + (sr.days.get(d) ?? 0), 0) + (dg.shifts.find(sh => sh.shift === 'OT')?.days.get(d) ?? 0), 0)),
            deptGroups.reduce((s, dg) => s + dg.sectionRows.reduce((ss, sr) => ss + [...sr.days.values()].reduce((a,b)=>a+b,0), 0) + (dg.shifts.find(sh=>sh.shift==='OT') ? [...dg.shifts.find(sh=>sh.shift==='OT')!.days.values()].reduce((a,b)=>a+b,0) : 0), 0)]
        const ca1Row = ['Ca 1:', ...days.map(d => deptGroups.reduce((s, dg) => s + dg.sectionRows.filter(sr => sr.shift === '1').reduce((ss, sr) => ss + (sr.days.get(d) ?? 0), 0), 0)),
            deptGroups.reduce((s, dg) => s + dg.sectionRows.filter(sr => sr.shift === '1').reduce((ss, sr) => ss + [...sr.days.values()].reduce((a,b)=>a+b,0), 0), 0)]
        const ca2Row = ['Ca 2:', ...days.map(d => deptGroups.reduce((s, dg) => s + dg.sectionRows.filter(sr => sr.shift === '2').reduce((ss, sr) => ss + (sr.days.get(d) ?? 0), 0), 0)),
            deptGroups.reduce((s, dg) => s + dg.sectionRows.filter(sr => sr.shift === '2').reduce((ss, sr) => ss + [...sr.days.values()].reduce((a,b)=>a+b,0), 0), 0)]
        const ca3Row = ['Ca 3:', ...days.map(d => deptGroups.reduce((s, dg) => s + dg.sectionRows.filter(sr => sr.shift === '3').reduce((ss, sr) => ss + (sr.days.get(d) ?? 0), 0), 0)),
            deptGroups.reduce((s, dg) => s + dg.sectionRows.filter(sr => sr.shift === '3').reduce((ss, sr) => ss + [...sr.days.values()].reduce((a,b)=>a+b,0), 0), 0)]
        const otRow = ['OT', ...days.map(d => deptGroups.reduce((s, dg) => s + (dg.shifts.find(sh => sh.shift === 'OT')?.days.get(d) ?? 0), 0)),
            deptGroups.reduce((s, dg) => s + (dg.shifts.find(sh=>sh.shift==='OT') ? [...dg.shifts.find(sh=>sh.shift==='OT')!.days.values()].reduce((a,b)=>a+b,0) : 0), 0)]
        const tvRow = ['Thời vụ', ...days.map(d => deptGroups.reduce((s, dg) => s + dg.sectionRows.reduce((ss, sr) => ss + (sr.seasonalDays.get(d) ?? 0), 0), 0)),
            deptGroups.reduce((s, dg) => s + dg.sectionRows.reduce((ss, sr) => ss + [...sr.seasonalDays.values()].reduce((a,b)=>a+b,0), 0), 0)]
        const ctRow = ['Chính thức', ...days.map(d => deptGroups.reduce((s, dg) => s + dg.sectionRows.reduce((ss, sr) => ss + (sr.officialDays.get(d) ?? 0), 0), 0)),
            deptGroups.reduce((s, dg) => s + dg.sectionRows.reduce((ss, sr) => ss + [...sr.officialDays.values()].reduce((a,b)=>a+b,0), 0), 0)]
        const wsData = [titleRow, periodRow, header, ...dataRows, totalRow, ca1Row, ca2Row, ca3Row, otRow, tvRow, ctRow]
        const ws = XLSX.utils.aoa_to_sheet(wsData)
        ws["!cols"] = [{ wch: 32 }, ...days.map(() => ({ wch: 5 })), { wch: 8 }]
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, `Cơm ${statsMonth}`)
        XLSX.writeFile(wb, `bao-com-${statsMonth}.xlsx`)
    }

    // ─── DB-based summary state ───
    const [summaryDate, setSummaryDate] = useState<string>(() => {
        const d = new Date()
        d.setDate(d.getDate() - 1)  // default: hôm qua
        return d.toISOString().slice(0, 10)
    })
    const [summaryShift, setSummaryShift] = useState<string>("2")
    const [summaryLoading, setSummaryLoading] = useState(false)
    const [summaryData, setSummaryData] = useState<SavedRecord[] | null>(null)
    const [summaryError, setSummaryError] = useState<string | null>(null)
    // Edit state
    const [editingRowId, setEditingRowId] = useState<string | null>(null)
    const [editFields, setEditFields] = useState<{ official_present: number; seasonal_present: number; vegetarian: number; ot_count: number }>({ official_present: 0, seasonal_present: 0, vegetarian: 0, ot_count: 0 })
    // Add-row state
    const [addRow, setAddRow] = useState<{ deptId: string; officialPresent: number; seasonalPresent: number; vegetarian: number; otCount: number } | null>(null)

    // ─── Daily summary state (chốt số gửi nhà ăn) ───
    // Ngày hôm qua — tính trực tiếp, không lưu state để tránh chọn nhầm ngày
    const getYesterday = () => {
        const d = new Date()
        d.setDate(d.getDate() - 1)
        return d.toISOString().slice(0, 10)
    }
    const [dailyLoading, setDailyLoading] = useState(false)
    const [dailyMsg, setDailyMsg] = useState<string | null>(null)
    const [dailyError, setDailyError] = useState<string | null>(null)
    const [copiedDaily, setCopiedDaily] = useState(false)

    const fetchDailySummary = async () => {
        const yesterday = getYesterday()   // luôn dùng hôm qua
        setDailyLoading(true)
        setDailyError(null)
        setDailyMsg(null)
        try {
            const { data, error } = await supabase
                .from("meal_headcount")
                .select("shift, official_present, seasonal_present, ot_count, vegetarian, ot_vegetarian")
                .eq("work_date", yesterday)
            if (error) throw error
            const rows = (data ?? []) as { shift: string; official_present: number; seasonal_present: number; ot_count: number; vegetarian: number; ot_vegetarian: number }[]
            // Tổng theo từng ca
            const ca1 = rows.filter(r => r.shift === '1').reduce((s, r) => s + (r.official_present ?? 0) + (r.seasonal_present ?? 0), 0)
            const ca2 = rows.filter(r => r.shift === '2').reduce((s, r) => s + (r.official_present ?? 0) + (r.seasonal_present ?? 0), 0)
            const ca3 = rows.filter(r => r.shift === '3').reduce((s, r) => s + (r.official_present ?? 0) + (r.seasonal_present ?? 0), 0)
            // OT: tổng ot_count từ tất cả ca + shift='OT' riêng
            const otFromShifts = rows.filter(r => r.shift !== 'OT').reduce((s, r) => s + (r.ot_count ?? 0), 0)
            const otShiftRows  = rows.filter(r => r.shift === 'OT').reduce((s, r) => s + (r.official_present ?? 0) + (r.seasonal_present ?? 0) + (r.ot_count ?? 0), 0)
            const totalOT = otFromShifts + otShiftRows
            // Chay OT
            const totalOTVeg = rows.reduce((s, r) => s + (r.ot_vegetarian ?? 0), 0)
            const grand = ca1 + ca2 + ca3 + totalOT
            const dateDisplay = format(parseISO(yesterday), "d/M/yyyy")
            let msg = `Ngày ${dateDisplay}\n`
            if (ca1 > 0) msg += `Ca 1: ${ca1}\n`
            if (ca2 > 0) msg += `Ca 2: ${ca2}\n`
            if (ca3 > 0) msg += `Ca 3: ${ca3}\n`
            if (totalOT > 0) {
                msg += `OT: ${totalOT}`
                if (totalOTVeg > 0) msg += ` (${totalOTVeg} chay)`
                msg += `\n`
            }
            msg += `Tổng: ${grand}`
            if (grand === 0) {
                setDailyError("⚠️ Không có dữ liệu cho ngày " + dateDisplay + " — hãy kiểm tra lại.")
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
            const { data, error } = await supabase
                .from("meal_headcount")
                .select("*")
                .eq("work_date", summaryDate)
                .eq("shift", summaryShift)
                .order("department_name")
            if (error) throw error
            // Aggregate: sum up all sub-section records that share the same department_id
            // (e.g. HPEEL has both "Manual Grading -Shift 1 (Ms Huệ)" AND "Manual peeling S1 - Dung"
            //  — they must be SUMMED, not deduped)
            const aggMap = new Map<string, SavedRecord>()
            ;(data ?? []).forEach(r => {
                const key = r.department_id ?? r.department_name
                if (!aggMap.has(key)) {
                    // Clone first record as the base
                    aggMap.set(key, { ...r })
                } else {
                    // Sum numeric fields into the base record
                    const base = aggMap.get(key)!
                    base.official_present  = (base.official_present  ?? 0) + (r.official_present  ?? 0)
                    base.official_absent   = (base.official_absent   ?? 0) + (r.official_absent   ?? 0)
                    base.seasonal_present  = (base.seasonal_present  ?? 0) + (r.seasonal_present  ?? 0)
                    base.seasonal_absent   = (base.seasonal_absent   ?? 0) + (r.seasonal_absent   ?? 0)
                    base.vegetarian        = (base.vegetarian        ?? 0) + (r.vegetarian        ?? 0)
                    base.ot_count          = (base.ot_count          ?? 0) + (r.ot_count          ?? 0)
                    base.ot_vegetarian     = (base.ot_vegetarian     ?? 0) + (r.ot_vegetarian     ?? 0)
                }
            })
            setSummaryData([...aggMap.values()].sort((a, b) => a.department_name.localeCompare(b.department_name)))

        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e)
            setSummaryError(msg || "Lỗi không xác định")
        } finally {
            setSummaryLoading(false)
        }
    }

    const handleDeleteRow = async (id: string) => {
        if (!confirm("Đồng ý xóa bản ghi này?")) return
        const { error } = await supabase.from("meal_headcount").delete().eq("id", id)
        if (error) {
            alert("Lỗi xóa: " + error.message)
            return
        }
        // Xóa luôn trong historyRecords (state local)
        setHistoryRecords(prev => prev.filter(r => r.id !== id))
        setHistoryRefreshKey(k => k + 1)
        // Re-fetch từ DB để đảm bảo không có bản ghi trùng cũ hiện lại
        await fetchSummaryFromDB()
    }

    const handleStartEdit = (r: SavedRecord) => {
        setEditingRowId(r.id)
        setEditFields({ official_present: r.official_present ?? 0, seasonal_present: r.seasonal_present ?? 0, vegetarian: r.vegetarian ?? 0, ot_count: r.ot_count ?? 0 })
    }

    const handleSaveEdit = async (id: string) => {
        // Gọi server-side API để bypass RLS (service role key)
        // Server vẫn verify role của user trước khi update
        const res = await fetch('/api/meal-headcount', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id,
                official_present: editFields.official_present,
                seasonal_present: editFields.seasonal_present,
                vegetarian: editFields.vegetarian,
                ot_count: editFields.ot_count,
            })
        })
        const json = await res.json()
        if (!res.ok) {
            alert('Lỗi lưu: ' + (json.error || res.statusText))
            return
        }
        setEditingRowId(null)
        // Re-fetch để hiển thị đúng data từ DB
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
        const { error } = await supabase.from("meal_headcount").upsert(payload, { onConflict: "work_date,department_id,shift" })
        if (!error) {
            setAddRow(null)
            await fetchSummaryFromDB()
            // Đồng bộ: đánh dấu để re-fetch lịch sử khi chuyển tab
            setHistoryRefreshKey(k => k + 1)
        } else {
            alert("Lỗi lưu: " + error.message)
        }
    }

    const buildDBSummaryText = (rows: SavedRecord[]): string => {
        const totalPresent = rows.reduce((s, r) => s + (r.official_present ?? 0) + (r.seasonal_present ?? 0), 0)
        const totalVeg = rows.reduce((s, r) => s + (r.vegetarian ?? 0), 0)
        const totalOT = rows.reduce((s, r) => s + (r.ot_count ?? 0), 0)
        const totalOTVeg = rows.reduce((s, r) => s + (r.ot_vegetarian ?? 0), 0)
        const man = totalPresent - totalVeg
        const dateDisplay = format(parseISO(summaryDate), "d/M/yyyy")
        const otHour = OT_HOUR[summaryShift] ?? ""
        let msg = `Ngày ${dateDisplay}\nCa ${summaryShift} có tổng cộng ${totalPresent} phần, trong đó số phần mặn là ${man}; số phần chay là ${totalVeg}`
        if (totalOT > 0) {
            msg += `; số phần OT là ${totalOT}`
            if (totalOTVeg > 0) msg += ` (${totalOTVeg} chay)`
            msg += ` (ăn lúc ${otHour})`
        }
        return msg
    }

    const getDBMissingDepts = (rows: SavedRecord[], shift: string): { code: string; name: string }[] => {
        // PEEL_MC is an alias for PEEL — treat them as the same dept for missing-check
        const DEPT_MISSING_ALIAS: Record<string, string> = { PEEL_MC: 'PEEL' }
        const reported = new Set(rows.map(r => {
            const code = r.department_id
                ? (deptList.find(d => d.id === r.department_id)?.code ?? "")
                : ""
            return DEPT_MISSING_ALIAS[code] ?? code
        }))
        // For Ca 2 and Ca 3, FGWH and OFFICE don't operate — skip them
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

    // ─── Parse handlers ───
    const [aiParsing, setAiParsing] = useState(false)
    const [aiError, setAiError]     = useState<string | null>(null)
    const [aiTruncated, setAiTruncated] = useState(false)
    const [confirmedRows, setConfirmedRows] = useState<Set<number>>(new Set())
    const [expandedSource, setExpandedSource] = useState<Set<number>>(new Set())
    const [confirmingRow, setConfirmingRow] = useState<number | null>(null)
    const [confirmMsg, setConfirmMsg] = useState<Record<number, { type: 'ok'|'err'; text: string }>>({})
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

            // ── Check nếu data đã tồn tại ──
            const { data: existing } = await supabase
                .from('meal_headcount')
                .select('id, official_present, seasonal_present, vegetarian, ot_count')
                .eq('work_date', workDate)
                .eq('department_name', canonicalName)
                .eq('shift', shift)
                .maybeSingle()

            if (existing) {
                const existSummary = `CT: ${existing.official_present ?? 0}, TV: ${existing.seasonal_present ?? 0}, Chay: ${existing.vegetarian ?? 0}, OT: ${existing.ot_count ?? 0}`
                const ok = window.confirm(
                    `⚠️ Đã có dữ liệu cho:\n` +
                    `📅 ${workDate}  |  Bộ phận: ${canonicalName}  |  Ca ${shift}\n` +
                    `Dữ liệu cũ: ${existSummary}\n\n` +
                    `Bạn có muốn ghi đè lại không?`
                )
                if (!ok) {
                    setConfirmMsg(prev => ({ ...prev, [i]: { type: 'err', text: '⏭ Bỏ qua (đã có data)' } }))
                    setConfirmingRow(null)
                    return
                }
            }

            const payload = {
                work_date: workDate,
                department_name: canonicalName,
                department_id: deptId,
                shift,
                official_present: r.officialPresent ?? 0,
                official_absent: r.officialAbsent ?? 0,
                seasonal_present: r.seasonalPresent ?? 0,
                seasonal_absent: r.seasonalAbsent ?? 0,
                ot_count: parseInt(r.ot) || 0,
                vegetarian: r.vegetarian ?? 0,
                note: null,
                created_by: user?.id,
                updated_at: new Date().toISOString(),
            }
            const { error } = await supabase.from('meal_headcount').upsert([payload], { onConflict: 'work_date,department_name,shift' })
            if (error) throw error

            setConfirmedRows(prev => new Set([...prev, i]))
            setConfirmMsg(prev => ({ ...prev, [i]: { type: 'ok', text: existing ? '✓ Đã ghi đè' : '✓ Đã lưu' } }))
        } catch (e) {
            setConfirmMsg(prev => ({ ...prev, [i]: { type: 'err', text: '❌ ' + (e instanceof Error ? e.message : String(e)) } }))
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

            // Map AI response → HeadcountRecord[]
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const aiRecords: HeadcountRecord[] = (json.records as any[]).map((r: any) => ({
                senderHint:         r.senderHint ?? '',
                date:               r.date ?? '',
                area:               r.area ?? '',
                shift:              String(r.shift ?? '1'),
                officialPresent:    r.officialPresent != null ? Number(r.officialPresent) : null,
                officialPresentNote: r.officialPresentNote ?? '',
                officialAbsent:     r.officialAbsent != null ? Number(r.officialAbsent) : null,
                seasonalPresent:    r.seasonalPresent != null ? Number(r.seasonalPresent) : null,
                seasonalAbsent:     r.seasonalAbsent != null ? Number(r.seasonalAbsent) : null,
                ot:                 String(r.ot ?? ''),
                vegetarian:         r.vegetarian != null ? Number(r.vegetarian) : null,
                raw:                rawText,   // Always show full pasted text as source
            }))
            setRecords(deduplicateRecords(aiRecords))
            setParsed(true)
            setSaveMsg(null)
            setAiTruncated(!!json.truncated)
            // Nếu AI không parse được → hiện warning thay vì crash
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
        const headers = ["Ngày", "Khu vực", "Ca", "CT Hiện diện", "CT Vắng", "TV Hiện diện", "TV Vắng", "OT", "Chay"]
        const rows = records.map((r) =>
            [r.date, r.area, r.shift, r.officialPresent ?? "", r.officialAbsent ?? "", r.seasonalPresent ?? "", r.seasonalAbsent ?? "", r.ot, r.vegetarian ?? ""].join("\t")
        )
        navigator.clipboard.writeText([headers.join("\t"), ...rows].join("\n"))
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    // ─── Save to DB ───
    const findDeptId = (areaName: string): string | null => {
        const lower = areaName.toLowerCase().trim()
        // 1. Try DEPT_MAP (display/alias text → code)
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

    // ─── Shift-aware canonical department name for DB ───
    const getCanonicalDeptName = (r: HeadcountRecord, i: number, deptId: string | null): string => {
        const _area = getEffectiveArea(r, i)
        const lower = _area.toLowerCase().trim()
        const shift = r.shift?.replace(/[^1-3]/g, '') || '1'
        const s = /^[123]$/.test(shift) ? shift : '1'
        const isDung = /dung/i.test(lower)
        const isLien = /li[ênế]n/i.test(lower)
        const isHue = /hu[ệê]/i.test(lower)
        // Handpeeling/Manual peeling with supervisor → shift-specific name
        if ((isDung || isLien) && (lower.includes('handpeeling') || lower.includes('manual peeling') || lower.includes('peeling'))) {
            return `Manual peeling S${s} - ${isDung ? 'Dung' : 'Liên'}`
        }
        if (isHue && (lower.includes('grading') || lower.includes('manual'))) {
            return `Manual Grading -Shift ${s} (Ms Huệ)`
        }
        // Tập vụ
        if (/t[ạḥâ]p\s*v[ụu]/i.test(_area)) {
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
                // Use canonical name_en if dept resolved; otherwise keep raw area string
                const _area = getEffectiveArea(r, i)
                const canonicalName = getCanonicalDeptName(r, i, deptId)
                return {
                work_date: dateToISO(r.date),
                department_name: canonicalName,
                department_id: deptId,
                shift: r.shift.replace(/[^1-3]/g, "") || "1",
                official_present: r.officialPresent ?? 0,
                official_absent: r.officialAbsent ?? 0,
                seasonal_present: r.seasonalPresent ?? 0,
                seasonal_absent: r.seasonalAbsent ?? 0,
                ot_count: parseInt(r.ot) || 0,
                vegetarian: r.vegetarian ?? 0,
                note: null,
                created_by: user?.id,
                updated_at: new Date().toISOString(),
                }
            })

            const { error } = await supabase.from("meal_headcount").upsert(payload, {
                onConflict: "work_date,department_name,shift",
            })

            if (error) throw error
            setSaveMsg({ type: "ok", text: `✅ Đã lưu ${payload.length} bản ghi thành công!` })
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Lỗi không xác định"
            setSaveMsg({ type: "err", text: `❌ Lỗi: ${message}` })
        } finally {
            setSaving(false)
        }
    }

    // ─── History ───
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
        <div className="max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-orange-100 border border-orange-200">
                        <UtensilsCrossed className="h-6 w-6 text-orange-600" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Meal Reporting — Headcount Tracker</h1>
                        <p className="text-sm text-muted-foreground">
                            Paste Zalo messages · Parse · Save to DB · View history
                        </p>
                    </div>
                </div>
            </div>

            {/* Tab navigation */}
            <div className="flex border-b">

                <button
                    onClick={() => setActiveTab("history")}
                    className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                        activeTab === "history"
                            ? "border-blue-500 text-blue-600"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                >
                    <History className="h-4 w-4" />
                    Saved Records
                </button>
                <button
                    onClick={() => setActiveTab("kitchen")}
                    className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                        activeTab === "kitchen"
                            ? "border-green-500 text-green-600"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                >
                    <MessageSquare className="h-4 w-4" />
                    🍳 Kitchen Summary
                </button>
                <button
                    onClick={() => setActiveTab("monthly")}
                    className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                        activeTab === "monthly"
                            ? "border-purple-500 text-purple-600"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                >
                    <span className="text-base leading-none">📅</span>
                    Monthly Report
                </button>
                {canEdit && (
                    <button
                        onClick={() => setActiveTab("ai-chat")}
                        className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                            activeTab === "ai-chat"
                                ? "border-orange-500 text-orange-600"
                                : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        <span className="text-base leading-none">🤖</span>
                        AI Nhập Nhanh
                    </button>
                )}
            </div>

            {/* ═══════════════════════════════════════════ */}
            {/* TAB: AI CHAT NHP NHANH                       */}
            {/* ═══════════════════════════════════════════ */}
            {activeTab === "ai-chat" && canEdit && (
                <MealAiChat
                    deptList={deptList}
                    onSaveSuccess={() => setHistoryRefreshKey(k => k + 1)}
                />
            )}

            {/* ═══════════════════════════════════════════ */}
            {/* TAB 3: KITCHEN / BÁO CƠM NHÀ ĂN               */}
            {/* ═══════════════════════════════════════════ */}
            {activeTab === "kitchen" && (
                <div className="space-y-5">
                    <div className="flex items-center gap-2 font-semibold text-green-700 text-lg">
                        <MessageSquare className="h-5 w-5" />
                        Tổng hợp báo cơm nhà ăn
                    </div>

                    {/* ── CHỐT SỐ GỬI NHÀ ĂN (tất cả ca trong ngày hôm qua) ── */}
                    <div className="bg-gradient-to-br from-orange-50 to-amber-50 border-2 border-orange-200 rounded-xl p-4 space-y-3">
                        <div className="flex items-center gap-2">
                            <Bell className="h-5 w-5 text-orange-500" />
                            <span className="font-bold text-orange-700 text-base">Chốt số gửi nhà ăn</span>
                            <span className="text-xs text-orange-500">(tổng hợp tất cả ca) — luôn chọn ngày hôm qua</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-4">
                            {/* Hiển thị ngày hôm qua dạng read-only */}
                            <div className="flex items-center gap-2 bg-orange-100 border border-orange-300 rounded-lg px-4 py-2">
                                <CalendarDays className="h-4 w-4 text-orange-500" />
                                <span className="text-sm font-bold text-orange-700">
                                    {format(parseISO(getYesterday()), "EEEE, d/M/yyyy", { locale: undefined })}
                                </span>
                                <span className="text-xs text-orange-400 italic">(hôm qua)</span>
                            </div>
                            <button
                                onClick={fetchDailySummary}
                                disabled={dailyLoading}
                                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold transition-all shadow-sm disabled:opacity-50"
                            >
                                <Bell className="h-4 w-4" />
                                {dailyLoading ? "Đang tổng hợp..." : "Tổng hợp & Chốt số"}
                            </button>
                        </div>
                        {dailyError && (
                            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{dailyError}</div>
                        )}
                        {dailyMsg && (
                            <div className="bg-white rounded-xl border-2 border-orange-300 shadow-sm p-4">
                                <div className="text-xs font-semibold text-orange-600 uppercase tracking-wide mb-2">📋 Tin nhắn chốt số — copy gửi nhà ăn</div>
                                <pre className="font-mono text-sm whitespace-pre-wrap text-gray-800 leading-relaxed text-base">{dailyMsg}</pre>
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(dailyMsg)
                                        setCopiedDaily(true)
                                        setTimeout(() => setCopiedDaily(false), 2000)
                                    }}
                                    className={`mt-3 flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                                        copiedDaily ? "bg-orange-500 text-white" : "bg-orange-100 hover:bg-orange-200 text-orange-700"
                                    }`}
                                >
                                    {copiedDaily ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                    {copiedDaily ? "Đã copy!" : "Copy tin nhắn"}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* ── Chi tiết theo ca (per-shift) ── */}
                    <div className="border-t border-dashed border-green-200 pt-4">
                    <div className="flex items-center gap-2 font-semibold text-green-600 text-sm mb-3">
                        <BarChart3 className="h-4 w-4" />
                        Chi tiết từng ca (để kiểm tra)
                    </div>

                    {/* Date + Shift selectors */}
                    <div className="flex flex-wrap items-end gap-3 bg-green-50 border border-green-200 rounded-xl p-4">
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-medium text-green-700">Ngày</label>
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
                                    <button
                                        key={s}
                                        onClick={() => setSummaryShift(s)}
                                        className={`px-4 py-1.5 rounded-lg text-sm font-bold border transition-colors ${
                                            summaryShift === s
                                                ? "bg-green-500 text-white border-green-500"
                                                : "bg-white text-green-700 border-green-300 hover:bg-green-100"
                                        }`}
                                    >{s}</button>
                                ))}
                            </div>
                        </div>
                        <button
                            onClick={fetchSummaryFromDB}
                            disabled={summaryLoading}
                            className="flex items-center gap-2 px-5 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-bold transition-colors disabled:opacity-50"
                        >
                            <BarChart3 className="h-4 w-4" />
                            {summaryLoading ? "Đang tải..." : "Tổng hợp"}
                        </button>
                    </div>
                    </div>

                    {summaryError && (
                        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{summaryError}</div>
                    )}

                    {summaryData !== null && (() => {
                        if (summaryData.length === 0) return (
                            <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                                ⚠️ Không có dữ liệu cho ngày này — có thể chưa lưu hoặc chưa báo đủ.
                            </div>
                        )
                        const msgText = buildDBSummaryText(summaryData)
                        const missingDepts = getDBMissingDepts(summaryData, summaryShift)
                        return (
                            <div className="space-y-4">
                                {/* Kitchen message box */}
                                <div className="bg-white rounded-xl border-2 border-green-200 shadow-sm p-4">
                                    <div className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-2">Tin nhắn gửi nhà ăn</div>
                                    <pre className="font-mono text-sm whitespace-pre-wrap text-gray-800 leading-relaxed">{msgText}</pre>
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(msgText)
                                            setCopiedSummary(true)
                                            setTimeout(() => setCopiedSummary(false), 2000)
                                        }}
                                        className={`mt-3 flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                                            copiedSummary ? "bg-green-600 text-white" : "bg-green-100 hover:bg-green-200 text-green-700"
                                        }`}
                                    >
                                        {copiedSummary ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                        {copiedSummary ? "Đã copy!" : "Copy tin nhắn"}
                                    </button>
                                </div>

                                {/* Per-dept breakdown */}
                                <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
                                    <div className="flex items-center justify-between px-4 py-2.5 bg-muted/40 border-b">
                                        <span className="text-sm font-semibold">Chi tiết từng bộ phận</span>
                                        {canEdit && (
                                        <button
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
                                                    <th className="px-3 py-2 font-semibold">Bộ phận</th>
                                                    <th className="px-3 py-2 font-semibold text-right">CT HĐ</th>
                                                    <th className="px-3 py-2 font-semibold text-right">TV HĐ</th>
                                                    <th className="px-3 py-2 font-semibold text-right">Tổng</th>
                                                    <th className="px-3 py-2 font-semibold text-right text-emerald-600">🥦 Chay</th>
                                                    <th className="px-3 py-2 font-semibold text-right">OT</th>
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
                                                                <td className="px-2 py-1 whitespace-nowrap">
                                                                    <button onClick={() => handleSaveEdit(r.id)} className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded hover:bg-blue-700 mr-1">Lưu</button>
                                                                    <button onClick={() => setEditingRowId(null)} className="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded hover:bg-gray-300">Hủy</button>
                                                                </td>
                                                            </>) : (<>
                                                                <td className="px-3 py-2 text-right font-semibold text-green-700">{r.official_present ?? 0}</td>
                                                                <td className="px-3 py-2 text-right">{r.seasonal_present ?? 0}</td>
                                                                <td className="px-3 py-2 text-right font-bold">{(r.official_present ?? 0) + (r.seasonal_present ?? 0)}</td>
                                                                <td className="px-3 py-2 text-right text-emerald-600 font-semibold">{r.vegetarian ?? 0}</td>
                                                                <td className="px-3 py-2 text-right">{r.ot_count ?? 0}</td>
                                                                <td className="px-2 py-2 whitespace-nowrap">
                                                                    {canEdit && (
                                                                    <>
                                                                    <button onClick={() => handleStartEdit(r)} className="text-xs text-blue-600 hover:underline mr-2">✏️ Edit</button>
                                                                    <button onClick={() => handleDeleteRow(r.id)} className="text-xs text-red-500 hover:underline">🗑 Delete</button>
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
                                                                <option value="">-- Chọn bộ phận --</option>
                                                                {deptList.map(d => <option key={d.id} value={d.id}>{d.name_en}</option>)}
                                                            </select>
                                                        </td>
                                                        <td className="px-1 py-1"><input type="number" min={0} placeholder="CT" className="w-16 border rounded px-1 py-0.5 text-sm text-right" value={addRow.officialPresent || ""} onChange={e => setAddRow(r => r ? { ...r, officialPresent: +e.target.value } : r)} /></td>
                                                        <td className="px-1 py-1"><input type="number" min={0} placeholder="TV" className="w-16 border rounded px-1 py-0.5 text-sm text-right" value={addRow.seasonalPresent || ""} onChange={e => setAddRow(r => r ? { ...r, seasonalPresent: +e.target.value } : r)} /></td>
                                                        <td className="px-3 py-2 text-right text-muted-foreground text-sm">{(addRow.officialPresent || 0) + (addRow.seasonalPresent || 0)}</td>
                                                        <td className="px-1 py-1"><input type="number" min={0} placeholder="Chay" className="w-16 border rounded px-1 py-0.5 text-sm text-right text-emerald-700" value={addRow.vegetarian || ""} onChange={e => setAddRow(r => r ? { ...r, vegetarian: +e.target.value } : r)} /></td>
                                                        <td className="px-1 py-1"><input type="number" min={0} placeholder="OT" className="w-14 border rounded px-1 py-0.5 text-sm text-right" value={addRow.otCount || ""} onChange={e => setAddRow(r => r ? { ...r, otCount: +e.target.value } : r)} /></td>
                                                        <td className="px-2 py-1 whitespace-nowrap">
                                                            <button onClick={handleAddRowSave} className="text-xs bg-green-600 text-white px-2 py-0.5 rounded hover:bg-green-700 mr-1">Lưu</button>
                                                            <button onClick={() => setAddRow(null)} className="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded">Hủy</button>
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                            <tfoot>
                                                <tr className="bg-muted/60 font-bold border-t-2 text-sm">
                                                    <td className="px-3 py-2">TỔNG</td>
                                                    <td className="px-3 py-2 text-right text-green-700">{summaryData.reduce((s, r) => s + (r.official_present ?? 0), 0)}</td>
                                                    <td className="px-3 py-2 text-right">{summaryData.reduce((s, r) => s + (r.seasonal_present ?? 0), 0)}</td>
                                                    <td className="px-3 py-2 text-right">{summaryData.reduce((s, r) => s + (r.official_present ?? 0) + (r.seasonal_present ?? 0), 0)}</td>
                                                    <td className="px-3 py-2 text-right text-emerald-600">{summaryData.reduce((s, r) => s + (r.vegetarian ?? 0), 0)}</td>
                                                    <td className="px-3 py-2 text-right">{summaryData.reduce((s, r) => s + (r.ot_count ?? 0), 0)}</td>
                                                    <td />
                                                    <td />
                                                    <td />
                                                    <td />
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
                                            Chưa có dữ liệu từ:
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

            {/* ═════════════════════════════════════════════ */}
            {/* TAB 4: MONTHLY STATS                          */}
            {/* ═════════════════════════════════════════════ */}
            {activeTab === "monthly" && (
                <div className="space-y-5">
                    <div className="flex items-center gap-2 font-semibold text-purple-700 text-lg">
                        <span className="text-xl">📅</span>
                        Thống kê suất cơm theo tháng
                    </div>

                    {/* Month picker + fetch */}
                    <div className="flex flex-wrap items-end gap-3 bg-purple-50 border border-purple-200 rounded-xl p-4">
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-medium text-purple-700">Tháng thanh toán</label>
                            <input
                                type="month"
                                value={statsMonth}
                                onChange={e => setStatsMonth(e.target.value)}
                                className="border rounded-lg px-3 py-1.5 text-sm bg-white"
                            />
                        </div>
                        {/* Billing cycle badge */}
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-medium text-purple-700">Chu kỳ</label>
                            <div className="flex items-center gap-1.5 bg-purple-100 border border-purple-300 rounded-lg px-3 py-1.5 text-sm font-semibold text-purple-800">
                                <CalendarDays className="h-3.5 w-3.5" />
                                {getBillingCycle(statsMonth).label}
                            </div>
                        </div>
                        <button
                            onClick={fetchMonthStats}
                            disabled={statsLoading}
                            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
                        >
                            {statsLoading ? (
                                <span className="animate-spin text-base">↻</span>
                            ) : (
                                <span>🔍</span>
                            )}
                            Xem thống kê
                        </button>
                        {statsData && statsData.length > 0 && (
                            <button
                                onClick={exportMonthlyExcel}
                                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                            >
                                <FileSpreadsheet className="h-4 w-4" />
                                Xuất Excel
                            </button>
                        )}
                    </div>

                    {statsError && (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{statsError}</div>
                    )}

                    {statsData !== null && (() => {
                        if (statsData.length === 0) return <div className="text-center text-muted-foreground py-8">Không có dữ liệu trong tháng này</div>
                        const { days, deptGroups } = buildMonthlyPivot(statsData)
                        // Total per day (all sections including OT)
                        const dayTotals = days.map(d =>
                            deptGroups.reduce((s, dg) =>
                                s + dg.sectionRows.reduce((ss, sr) => ss + (sr.days.get(d) ?? 0), 0)
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
                                        <div className="font-bold text-sm">TIỀN CƠM CÁN BỘ CÔNG NHÂN VIÊN THÁNG {statsMonth}</div>
                                        <div className="text-xs text-muted-foreground font-normal">Chu kỳ: {getBillingCycle(statsMonth).label}</div>
                                    </div>
                                    <button onClick={exportMonthlyExcel} className="flex items-center gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg transition-colors">
                                        <FileSpreadsheet className="h-3.5 w-3.5" /> Xuất Excel
                                    </button>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="text-xs min-w-full border-collapse">
                                        <thead>
                                            <tr className="bg-slate-100 text-slate-700 border-b-2 border-slate-300">
                                                <th className="px-3 py-2 font-bold text-left sticky left-0 bg-slate-100 z-10 min-w-[160px] border-r border-slate-300">
                                                    Bộ phận
                                                </th>
                                                <th className="px-2 py-2 font-bold text-center sticky left-[160px] bg-slate-100 z-10 w-10 border-r border-slate-300">
                                                    Ca
                                                </th>
                                                {days.map(d => (
                                                    <th key={d} className="px-1.5 py-2 font-bold text-center w-8">
                                                        {parseInt(d.slice(8), 10)}
                                                    </th>
                                                ))}
                                                <th className="px-2 py-2 font-bold text-center bg-slate-200 border-l border-slate-300">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {deptGroups.map(dept => {
                                                const deptOT = dept.shifts.find(sh => sh.shift === 'OT')
                                                const deptOTTotal = deptOT ? [...deptOT.days.values()].reduce((a,b)=>a+b,0) : 0
                                                const deptTotal = dept.sectionRows.reduce((s, sr) => s + [...sr.days.values()].reduce((a,b)=>a+b,0), 0) + (deptOTTotal ?? 0)
                                                return (
                                                <Fragment key={dept.code || dept.deptKey}>
                                                    {/* Dept group header row */}
                                                    <tr className="bg-slate-200 border-t-2 border-slate-400">
                                                        <td colSpan={days.length + 3}
                                                            className="px-3 py-1 sticky left-0 font-bold text-slate-700 text-xs uppercase tracking-wide">
                                                            📦 {dept.name}
                                                            <span className="ml-2 text-slate-500 font-normal normal-case tracking-normal">
                                                                — Tổng: {deptTotal > 0 ? deptTotal : 0} phần
                                                            </span>
                                                        </td>
                                                    </tr>
                                                    {/* Section data rows — exclude shift='OT' since OT is shown in the deptOT row below */}
                                                    {dept.sectionRows.filter(sr => sr.shift !== 'OT').map((sr, sIdx) => {
                                                        const rowTotal = [...sr.days.values()].reduce((a, b) => a + b, 0)
                                                        const isTV = /thời vụ/i.test(sr.sectionName)
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
                                                                                        disabled={rowSaving}
                                                                                        onClick={async () => {
                                                                                            setRowSaving(true)
                                                                                            // Batch save all changed cells
                                                                                            for (const [date, draftVal] of Object.entries(rowEditDrafts)) {
                                                                                                const newVal = parseInt(draftVal) || 0
                                                                                                const orig = sr.days.get(date) ?? 0
                                                                                                if (newVal === orig) continue
                                                                                                const matches = (statsData ?? []).filter(r =>
                                                                                                    r.work_date === date && r.shift === sr.shift &&
                                                                                                    r.department_name.toLowerCase() === sr.sectionName.toLowerCase()
                                                                                                )
                                                                                                if (matches.length > 0) {
                                                                                                    const rec = matches[0]
                                                                                                    const diff = newVal - orig
                                                                                                    const newOfficial = Math.max(0, (rec.official_present ?? 0) + diff)
                                                                                                    await supabase.from('meal_headcount').update({ official_present: newOfficial }).eq('id', rec.id)
                                                                                                    setStatsData(prev => prev ? prev.map(r => r.id === rec.id ? { ...r, official_present: newOfficial } : r) : prev)
                                                                                                }
                                                                                            }
                                                                                            setRowSaving(false)
                                                                                            setEditingRowKey(null)
                                                                                            setRowEditDrafts({})
                                                                                        }}
                                                                                        className="px-1.5 py-0.5 bg-green-500 hover:bg-green-600 text-white text-[9px] font-bold rounded disabled:opacity-50 transition-colors"
                                                                                    >{rowSaving ? '...' : '💾'}</button>
                                                                                    <button
                                                                                        onClick={() => { setEditingRowKey(null); setRowEditDrafts({}) }}
                                                                                        className="px-1.5 py-0.5 bg-slate-400 hover:bg-slate-500 text-white text-[9px] font-bold rounded transition-colors"
                                                                                    >✕</button>
                                                                                </div>
                                                                            ) : (
                                                                                <button
                                                                                    onClick={() => {
                                                                                        setEditingRowKey(rowKey)
                                                                                        const drafts: Record<string, string> = {}
                                                                                        days.forEach(d => { drafts[d] = String(sr.days.get(d) ?? 0) })
                                                                                        setRowEditDrafts(drafts)
                                                                                    }}
                                                                                    className="shrink-0 px-2 py-0.5 bg-amber-100 hover:bg-amber-400 hover:text-white text-amber-700 text-[10px] font-bold rounded border border-amber-300 transition-colors"
                                                                                >✏️ Sửa</button>
                                                                            )
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td className={`px-1 py-1 sticky left-[160px] z-10 text-center border-r border-slate-200 ${isRowEditing ? 'bg-yellow-50' : 'bg-white'}`}>
                                                                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${shiftColor}`}>{shiftLabel}</span>
                                                                </td>
                                                                {days.map(d => {
                                                                    const v = isRowEditing ? (parseInt(rowEditDrafts[d]) || 0) : (sr.days.get(d) ?? 0)
                                                                    const origV = sr.days.get(d) ?? 0
                                                                    const changed = isRowEditing && parseInt(rowEditDrafts[d] ?? '') !== origV
                                                                    return (
                                                                        <td key={d}
                                                                            className={`px-0 py-0 text-center text-xs ${
                                                                                isRowEditing ? (changed ? 'bg-yellow-100' : 'bg-yellow-50') :
                                                                                origV > 0 ? (isTV ? 'text-blue-600 font-semibold' : 'font-semibold text-slate-800') : 'text-slate-200'
                                                                            }`}
                                                                        >
                                                                            {isRowEditing ? (
                                                                                <input
                                                                                    type="number"
                                                                                    min={0}
                                                                                    value={rowEditDrafts[d] ?? ''}
                                                                                    onChange={e => setRowEditDrafts(prev => ({ ...prev, [d]: e.target.value }))}
                                                                                    onKeyDown={e => { if (e.key === 'Escape') { setEditingRowKey(null); setRowEditDrafts({}) } }}
                                                                                    className={`w-10 h-6 text-center text-xs rounded outline-none font-semibold ${
                                                                                        changed ? 'border-2 border-amber-400 bg-amber-50' : 'border border-slate-200 bg-yellow-50'
                                                                                    }`}
                                                                                />
                                                                            ) : (
                                                                                <span className="block px-1.5 py-1">
                                                                                    {origV > 0 ? origV : '—'}
                                                                                </span>
                                                                            )}
                                                                        </td>
                                                                    )
                                                                })}
                                                                <td className={`px-2 py-1 text-center font-bold border-l border-slate-200 text-xs ${
                                                                    rowTotal > 0 ? (isTV ? 'text-blue-700' : 'text-slate-700') : 'text-slate-300'
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
                                                                        <span className="whitespace-nowrap">{dept.name} (OT)</span>
                                                                        {canEdit && (
                                                                            isOTEditing ? (
                                                                                <div className="flex gap-1 ml-1 shrink-0">
                                                                                    <button
                                                                                        disabled={rowSaving}
                                                                                        onClick={async () => {
                                                                                            setRowSaving(true)
                                                                                            for (const [date, draftVal] of Object.entries(rowEditDrafts)) {
                                                                                                const newVal = parseInt(draftVal) || 0
                                                                                                const orig = deptOT?.days.get(date) ?? 0
                                                                                                if (newVal === orig) continue
                                                                                                const matches = (statsData ?? []).filter(r =>
                                                                                                    r.work_date === date && r.shift === 'OT' &&
                                                                                                    r.department_name.toLowerCase() === dept.name.toLowerCase()
                                                                                                )
                                                                                                if (matches.length > 0) {
                                                                                                    const rec = matches[0]
                                                                                                    await supabase.from('meal_headcount').update({ ot_count: newVal }).eq('id', rec.id)
                                                                                                    setStatsData(prev => prev ? prev.map(r => r.id === rec.id ? { ...r, ot_count: newVal } : r) : prev)
                                                                                                }
                                                                                            }
                                                                                            setRowSaving(false)
                                                                                            setEditingRowKey(null)
                                                                                            setRowEditDrafts({})
                                                                                        }}
                                                                                        className="px-1.5 py-0.5 bg-green-500 hover:bg-green-600 text-white text-[9px] font-bold rounded disabled:opacity-50 transition-colors"
                                                                                    >{rowSaving ? '...' : '💾'}</button>
                                                                                    <button
                                                                                        onClick={() => { setEditingRowKey(null); setRowEditDrafts({}) }}
                                                                                        className="px-1.5 py-0.5 bg-slate-400 hover:bg-slate-500 text-white text-[9px] font-bold rounded transition-colors"
                                                                                    >✕</button>
                                                                                </div>
                                                                            ) : (
                                                                                <button
                                                                                    onClick={() => {
                                                                                        setEditingRowKey(otRowKey)
                                                                                        const drafts: Record<string, string> = {}
                                                                                        days.forEach(d => { drafts[d] = String(deptOT?.days.get(d) ?? 0) })
                                                                                        setRowEditDrafts(drafts)
                                                                                    }}
                                                                                    className="shrink-0 px-2 py-0.5 bg-orange-100 hover:bg-orange-400 hover:text-white text-orange-700 text-[10px] font-bold rounded border border-orange-300 transition-colors"
                                                                                >✏️ Sửa</button>
                                                                            )
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td className={`px-1 py-1 sticky left-[160px] z-10 text-center border-r border-orange-100 ${isOTEditing ? 'bg-yellow-50' : 'bg-orange-50'}`}>
                                                                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-700">OT</span>
                                                                </td>
                                                                {days.map(d => {
                                                                    const origV = deptOT?.days.get(d) ?? 0
                                                                    const changed = isOTEditing && parseInt(rowEditDrafts[d] ?? '') !== origV
                                                                    return (
                                                                        <td key={d} className={`px-0 py-0 text-center text-xs ${
                                                                            isOTEditing ? (changed ? 'bg-yellow-100' : 'bg-yellow-50') :
                                                                            origV > 0 ? 'text-orange-600 font-semibold' : 'text-orange-200'
                                                                        }`}>
                                                                            {isOTEditing ? (
                                                                                <input
                                                                                    type="number"
                                                                                    min={0}
                                                                                    value={rowEditDrafts[d] ?? ''}
                                                                                    onChange={e => setRowEditDrafts(prev => ({ ...prev, [d]: e.target.value }))}
                                                                                    onKeyDown={e => { if (e.key === 'Escape') { setEditingRowKey(null); setRowEditDrafts({}) } }}
                                                                                    className={`w-10 h-6 text-center text-xs rounded outline-none font-semibold ${
                                                                                        changed ? 'border-2 border-amber-400 bg-amber-50' : 'border border-slate-200 bg-yellow-50'
                                                                                    }`}
                                                                                />
                                                                            ) : (
                                                                                <span className="block px-1.5 py-1">{origV > 0 ? origV : '—'}</span>
                                                                            )}
                                                                        </td>
                                                                    )
                                                                })}
                                                                <td className="px-2 py-1 text-center font-bold text-orange-700 border-l border-orange-100 text-xs">
                                                                    {deptOTTotal}
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
                                                <td className="px-3 py-2 sticky left-0 bg-slate-700 z-10 border-r border-slate-500">TỔNG</td>
                                                <td className="px-2 py-2 sticky left-[160px] bg-slate-700 z-10 border-r border-slate-500"></td>
                                                {dayTotals.map((v, i) => <td key={days[i]} className="px-1.5 py-2 text-center">{v > 0 ? v : ''}</td>)}
                                                <td className="px-2 py-2 text-center border-l border-slate-500">{grandTotal}</td>
                                            </tr>
                                            <tr className="bg-blue-600 text-white text-[11px]">
                                                <td className="px-3 py-1.5 sticky left-0 bg-blue-600 z-10 font-semibold border-r border-blue-400">Ca 1:</td>
                                                <td className="px-2 py-1.5 sticky left-[160px] bg-blue-600 z-10 border-r border-blue-400"></td>
                                                {ca1Totals.map((v, i) => <td key={days[i]} className="px-1.5 py-1.5 text-center">{v > 0 ? v : ''}</td>)}
                                                <td className="px-2 py-1.5 text-center font-bold border-l border-blue-400">{ca1Totals.reduce((a,b)=>a+b,0)}</td>
                                            </tr>
                                            <tr className="bg-blue-500 text-white text-[11px]">
                                                <td className="px-3 py-1.5 sticky left-0 bg-blue-500 z-10 font-semibold border-r border-blue-300">Ca 2:</td>
                                                <td className="px-2 py-1.5 sticky left-[160px] bg-blue-500 z-10 border-r border-blue-300"></td>
                                                {ca2Totals.map((v, i) => <td key={days[i]} className="px-1.5 py-1.5 text-center">{v > 0 ? v : ''}</td>)}
                                                <td className="px-2 py-1.5 text-center font-bold border-l border-blue-300">{ca2Totals.reduce((a,b)=>a+b,0)}</td>
                                            </tr>
                                            <tr className="bg-blue-400 text-white text-[11px]">
                                                <td className="px-3 py-1.5 sticky left-0 bg-blue-400 z-10 font-semibold border-r border-blue-200">Ca 3:</td>
                                                <td className="px-2 py-1.5 sticky left-[160px] bg-blue-400 z-10 border-r border-blue-200"></td>
                                                {ca3Totals.map((v, i) => <td key={days[i]} className="px-1.5 py-1.5 text-center">{v > 0 ? v : ''}</td>)}
                                                <td className="px-2 py-1.5 text-center font-bold border-l border-blue-200">{ca3Totals.reduce((a,b)=>a+b,0)}</td>
                                            </tr>
                                            <tr className="bg-orange-500 text-white text-[11px]">
                                                <td className="px-3 py-1.5 sticky left-0 bg-orange-500 z-10 font-semibold border-r border-orange-300">OT</td>
                                                <td className="px-2 py-1.5 sticky left-[160px] bg-orange-500 z-10 border-r border-orange-300"></td>
                                                {otDayTotals.map((v, i) => <td key={days[i]} className="px-1.5 py-1.5 text-center">{v > 0 ? v : ''}</td>)}
                                                <td className="px-2 py-1.5 text-center font-bold border-l border-orange-300">{otDayTotals.reduce((a,b)=>a+b,0)}</td>
                                            </tr>
                                            <tr className="bg-purple-100 text-purple-800 text-[11px]">
                                                <td className="px-3 py-1.5 sticky left-0 bg-purple-100 z-10 font-semibold border-r border-purple-200">Thời vụ</td>
                                                <td className="px-2 py-1.5 sticky left-[160px] bg-purple-100 z-10 border-r border-purple-200"></td>
                                                {tvDayTotals.map((v, i) => <td key={days[i]} className="px-1.5 py-1.5 text-center">{v > 0 ? v : ''}</td>)}
                                                <td className="px-2 py-1.5 text-center font-bold border-l border-purple-200">{tvDayTotals.reduce((a,b)=>a+b,0)}</td>
                                            </tr>
                                            <tr className="bg-green-100 text-green-800 text-[11px]">
                                                <td className="px-3 py-1.5 sticky left-0 bg-green-100 z-10 font-semibold border-r border-green-200">Chính thức</td>
                                                <td className="px-2 py-1.5 sticky left-[160px] bg-green-100 z-10 border-r border-green-200"></td>
                                                {ctDayTotals.map((v, i) => <td key={days[i]} className="px-1.5 py-1.5 text-center">{v > 0 ? v : ''}</td>)}
                                                <td className="px-2 py-1.5 text-center font-bold border-l border-green-200">{ctDayTotals.reduce((a,b)=>a+b,0)}</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>
                        )
                    })()}
                </div>
            )}

            {/* ═══════════════════════════════════════════ */}
            {/* TAB 1: PARSE & SAVE                        */}
            {/* ═══════════════════════════════════════════ */}
            {false && (
                <>
                    {/* Paste area */}
                    {!parsed && (
                        <div className="bg-card rounded-xl border shadow-sm p-4 space-y-4">
                            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                <ClipboardPaste className="h-4 w-4" />
                                Paste nội dung chat Zalo vào đây (copy tất cả các tin nhắn báo cơm của ngày)
                            </div>
                            <textarea
                                id="zalo-paste-area"
                                value={rawText}
                                onChange={(e) => setRawText(e.target.value)}
                                placeholder={`Ví dụ:\n28.3.2026\nKhu vực : Boiler\nCa: 1.2.3\nChính thức hiện diện: 3\nChính thức vắng: 0\n2Thời vụ hiện diện:0\nThời vụ vắng :0\nOT:\n\nDate: 28/03/2026\nKhu vực : Peeling mc\nCa: 1\nChính thức hiện diện: 7\n...`}
                                rows={16}
                                className="w-full rounded-lg border bg-muted/30 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-400 resize-y"
                                style={{ minHeight: "260px" }}
                            />
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                                <p className="text-xs text-muted-foreground">
                                    💡 Không cần xóa tên người gửi hay timestamp — hệ thống tự bỏ qua.
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
                                        {aiParsing ? "AI đang xử lý..." : "🤖 AI Phân tích"}
                                    </Button>
                                    {/* Manual parse button */}
                                    <Button
                                        id="parse-btn"
                                        onClick={handleParse}
                                        disabled={!rawText.trim()}
                                        className="gap-2 bg-orange-600 hover:bg-orange-700 text-white px-6"
                                    >
                                        <Sparkles className="h-4 w-4" />
                                        Phân tích ngay
                                    </Button>
                                </div>
                            </div>
                            {aiError && (
                                <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-2">
                                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                                    <span>AI lỗi: {aiError}</span>
                                </div>
                            )}
                            {aiTruncated && (
                                <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                                    <span>⚠️ Text quá dài — AI chỉ đọc được phần đầu (~8000 ký tự). Kết quả có thể thiếu. Hãy paste từng ca riêng để đảm bảo đầy đủ.</span>
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
                                    {copied ? "Đã copy!" : "Copy bảng"}
                                </Button>
                                <Button size="sm" onClick={() => exportCSV(records)} className="gap-2 bg-green-600 hover:bg-green-700 text-white">
                                    <Download className="h-4 w-4" />
                                    Xuất Excel (.csv)
                                </Button>
                                {canSave && records.length > 0 && (
                                    <Button
                                        size="sm"
                                        onClick={handleSaveToDB}
                                        disabled={saving}
                                        className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                                    >
                                        <Save className="h-4 w-4" />
                                        {saving ? "Đang lưu..." : `💾 Lưu ${records.length} bản ghi vào DB`}
                                    </Button>
                                )}
                                <Button
                                    size="sm"
                                    onClick={() => setShowSummary(s => !s)}
                                    className={`gap-2 ${showSummary ? "bg-orange-600 hover:bg-orange-700" : "bg-orange-500 hover:bg-orange-600"} text-white`}
                                >
                                    <BarChart3 className="h-4 w-4" />
                                    Tổng hợp báo cơm
                                </Button>
                                <Button variant="outline" size="sm" onClick={handleReset} className="gap-2">
                                    <RefreshCw className="h-4 w-4" />
                                    Làm mới
                                </Button>
                            </div>


                            {/* Summary panel */}
                            {showSummary && (
                                <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 space-y-4">
                                    <div className="flex items-center gap-2 font-semibold text-orange-700">
                                        <MessageSquare className="h-4 w-4" />
                                        Tổng hợp báo cơm nhà ăn
                                    </div>

                                    {/* Date + Shift selectors */}
                                    <div className="flex flex-wrap items-end gap-3">
                                        <div className="flex flex-col gap-1">
                                            <label className="text-xs font-medium text-orange-700">Ngày</label>
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
                                                    <button
                                                        key={s}
                                                        onClick={() => setSummaryShift(s)}
                                                        className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${
                                                            summaryShift === s
                                                                ? "bg-orange-500 text-white border-orange-500"
                                                                : "bg-white text-orange-700 border-orange-300 hover:bg-orange-100"
                                                        }`}
                                                    >{s}</button>
                                                ))}
                                            </div>
                                        </div>
                                        <button
                                            onClick={fetchSummaryFromDB}
                                            disabled={summaryLoading}
                                            className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                                        >
                                            <BarChart3 className="h-4 w-4" />
                                            {summaryLoading ? "Đang tải..." : "Tổng hợp"}
                                        </button>
                                    </div>

                                    {summaryError && (
                                        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{summaryError}</div>
                                    )}

                                    {summaryData !== null && (() => {
                                        if (summaryData!.length === 0) return (
                                            <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                                Không có dữ liệu cho ngày này — có thể chưa lưu hoặc chưa báo đủ.
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
                                                <button
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(msgText)
                                                        setCopiedSummary(true)
                                                        setTimeout(() => setCopiedSummary(false), 2000)
                                                    }}
                                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                                                        copiedSummary ? "bg-green-600 text-white" : "bg-orange-600 hover:bg-orange-700 text-white"
                                                    }`}
                                                >
                                                    {copiedSummary ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                                    {copiedSummary ? "Đã copy!" : "Copy tin nhắn"}
                                                </button>

                                                {/* Per-dept breakdown */}
                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-xs border rounded-lg overflow-hidden">
                                                        <thead>
                                                            <tr className="bg-orange-100 text-orange-700 text-left">
                                                                <th className="px-2 py-1.5 font-semibold">Bộ phận</th>
                                                                <th className="px-2 py-1.5 font-semibold text-right">CT HĐ</th>
                                                                <th className="px-2 py-1.5 font-semibold text-right">TV HĐ</th>
                                                                <th className="px-2 py-1.5 font-semibold text-right">Chay</th>
                                                                <th className="px-2 py-1.5 font-semibold text-right">OT</th>
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
                                                                    <td className="px-2 py-1 text-right">{r.ot_count ?? 0}</td>
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
                                                            Chưa có dữ liệu từ các bộ phận:
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
                                <div className={`rounded-lg px-4 py-2.5 text-sm font-medium ${
                                    saveMsg!.type === "ok"
                                        ? "bg-green-50 text-green-700 border border-green-200"
                                        : "bg-red-50 text-red-700 border border-red-200"
                                }`}>
                                    {saveMsg!.text}
                                </div>
                            )}

                            {/* Summary cards */}
                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                                {[
                                    { label: "Bộ phận", value: records.length, unit: "KV", bg: "bg-blue-50", text: "text-blue-600", border: "border-blue-200" },
                                    { label: "CT Hiện diện", value: summary.totalOfficial, unit: "người", bg: "bg-green-50", text: "text-green-600", border: "border-green-200" },
                                    { label: "CT Vắng", value: summary.totalAbsent, unit: "người", bg: "bg-red-50", text: "text-red-600", border: "border-red-200" },
                                    { label: "TV Hiện diện", value: summary.totalSeasonal, unit: "người", bg: "bg-purple-50", text: "text-purple-600", border: "border-purple-200" },
                                    { label: "Chay hôm nay", value: summary.totalVeg || "—", unit: summary.totalVeg ? "suất" : "", bg: "bg-orange-50", text: "text-orange-600", border: "border-orange-200" },
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
                                    <p className="font-semibold text-yellow-800">Không tìm thấy dữ liệu hợp lệ</p>
                                    <p className="text-sm text-yellow-700">
                                        Hệ thống cần tìm thấy các từ khóa như &quot;Khu vực&quot;, &quot;Chính thức hiện diện&quot;, cùng với ngày tháng.
                                    </p>
                                    <Button variant="outline" size="sm" onClick={handleReset} className="mt-2 gap-2">
                                        <RefreshCw className="h-4 w-4" /> Thử lại
                                    </Button>
                                </div>
                            ) : (
                                <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
                                    <div className="px-4 py-3 border-b flex items-center justify-between bg-muted/40">
                                        <div className="flex items-center gap-2">
                                            <TableIcon className="h-4 w-4 text-muted-foreground" />
                                            <span className="font-semibold text-sm">
                                                Kết quả — {uniqueDates.join(", ")} &nbsp;|&nbsp; {records.length} khu vực
                                            </span>
                                        </div>
                                        <span className="text-xs text-muted-foreground">
                                            CT = Chính thức &nbsp;·&nbsp; TV = Thời vụ
                                        </span>
                                    </div>

                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="bg-muted/60 text-left text-xs text-muted-foreground uppercase tracking-wide">
                                                    <th className="px-3 py-2.5 font-semibold">#</th>
                                                    <th className="px-3 py-2.5 font-semibold">Ngày</th>
                                                    <th className="px-3 py-2.5 font-semibold">Khu vực</th>
                                                    <th className="px-3 py-2.5 font-semibold">Ca</th>
                                                    <th className="px-3 py-2.5 font-semibold text-right">CT HĐ</th>
                                                    <th className="px-3 py-2.5 font-semibold text-right">CT Vắng</th>
                                                    <th className="px-3 py-2.5 font-semibold text-right">TV HĐ</th>
                                                    <th className="px-3 py-2.5 font-semibold text-right">TV Vắng</th>
                                                    <th className="px-3 py-2.5 font-semibold text-right">OT</th>
                                                    <th className="px-3 py-2.5 font-semibold text-right">🥦 Chay</th>
                                                    <th className="px-3 py-2.5 font-semibold">DB Link</th>
                                                     <th className="px-3 py-2.5 font-semibold text-center">Nguồn</th>
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
                                                            {/* CT HĐ — editable */}
                                                            <td className="px-3 py-2.5 text-right">
                                                                {editingCell?.row === i && editingCell?.field === 'officialPresent' ? (
                                                                    <input autoFocus type="number" value={editDraft}
                                                                        onChange={e => setEditDraft(e.target.value)}
                                                                        onBlur={() => commitEdit(i, 'officialPresent')}
                                                                        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditingCell(null) }}
                                                                        className="w-16 text-right border border-blue-400 rounded px-1 py-0 text-sm bg-blue-50 focus:outline-none" />
                                                                ) : (
                                                                    <span className="font-bold text-green-700 cursor-pointer hover:ring-1 hover:ring-blue-300 rounded px-1" title="Click để sửa"
                                                                        onClick={() => { setEditingCell({ row: i, field: 'officialPresent' }); setEditDraft(String(r.officialPresent ?? '')) }}>
                                                                        {r.officialPresent ?? <span className="text-muted-foreground font-normal">—</span>}
                                                                        {r.officialPresentNote && <span className="text-xs font-normal text-muted-foreground ml-1">{r.officialPresentNote}</span>}
                                                                    </span>
                                                                )}
                                                            </td>
                                                            {/* CT Vắng — editable */}
                                                            <td className="px-3 py-2.5 text-right">
                                                                {editingCell?.row === i && editingCell?.field === 'officialAbsent' ? (
                                                                    <input autoFocus type="number" value={editDraft}
                                                                        onChange={e => setEditDraft(e.target.value)}
                                                                        onBlur={() => commitEdit(i, 'officialAbsent')}
                                                                        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditingCell(null) }}
                                                                        className="w-16 text-right border border-blue-400 rounded px-1 py-0 text-sm bg-blue-50 focus:outline-none" />
                                                                ) : (
                                                                    <span className={`cursor-pointer hover:ring-1 hover:ring-blue-300 rounded px-1 ${r.officialAbsent != null && r.officialAbsent > 0 ? 'font-bold text-red-600' : 'text-muted-foreground'}`}
                                                                        title="Click để sửa"
                                                                        onClick={() => { setEditingCell({ row: i, field: 'officialAbsent' }); setEditDraft(String(r.officialAbsent ?? '')) }}>
                                                                        {r.officialAbsent ?? '—'}
                                                                    </span>
                                                                )}
                                                            </td>
                                                            {/* TV HĐ — editable */}
                                                            <td className="px-3 py-2.5 text-right">
                                                                {editingCell?.row === i && editingCell?.field === 'seasonalPresent' ? (
                                                                    <input autoFocus type="number" value={editDraft}
                                                                        onChange={e => setEditDraft(e.target.value)}
                                                                        onBlur={() => commitEdit(i, 'seasonalPresent')}
                                                                        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditingCell(null) }}
                                                                        className="w-16 text-right border border-blue-400 rounded px-1 py-0 text-sm bg-blue-50 focus:outline-none" />
                                                                ) : (
                                                                    <span className="cursor-pointer hover:ring-1 hover:ring-blue-300 rounded px-1 text-muted-foreground" title="Click để sửa"
                                                                        onClick={() => { setEditingCell({ row: i, field: 'seasonalPresent' }); setEditDraft(String(r.seasonalPresent ?? '')) }}>
                                                                        {r.seasonalPresent ?? '—'}
                                                                    </span>
                                                                )}
                                                            </td>
                                                            {/* TV Vắng — editable */}
                                                            <td className="px-3 py-2.5 text-right">
                                                                {editingCell?.row === i && editingCell?.field === 'seasonalAbsent' ? (
                                                                    <input autoFocus type="number" value={editDraft}
                                                                        onChange={e => setEditDraft(e.target.value)}
                                                                        onBlur={() => commitEdit(i, 'seasonalAbsent')}
                                                                        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditingCell(null) }}
                                                                        className="w-16 text-right border border-blue-400 rounded px-1 py-0 text-sm bg-blue-50 focus:outline-none" />
                                                                ) : (
                                                                    <span className="cursor-pointer hover:ring-1 hover:ring-blue-300 rounded px-1 text-muted-foreground" title="Click để sửa"
                                                                        onClick={() => { setEditingCell({ row: i, field: 'seasonalAbsent' }); setEditDraft(String(r.seasonalAbsent ?? '')) }}>
                                                                        {r.seasonalAbsent ?? '—'}
                                                                    </span>
                                                                )}
                                                            </td>
                                                            {/* OT — editable + shift timing label */}
                                                            <td className="px-3 py-2.5 text-right text-xs">
                                                                {editingCell?.row === i && editingCell?.field === 'ot' ? (
                                                                    <input autoFocus type="text" value={editDraft}
                                                                        onChange={e => setEditDraft(e.target.value)}
                                                                        onBlur={() => commitEdit(i, 'ot')}
                                                                        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditingCell(null) }}
                                                                        className="w-16 text-right border border-blue-400 rounded px-1 py-0 text-sm bg-blue-50 focus:outline-none" />
                                                                ) : (
                                                                    <span className="cursor-pointer hover:ring-1 hover:ring-blue-300 rounded px-1" title="Click để sửa"
                                                                        onClick={() => { setEditingCell({ row: i, field: 'ot' }); setEditDraft(r.ot) }}>
                                                                        {r.ot && r.ot !== '0' && r.ot !== '' ? (
                                                                            <>{r.ot}<span className="text-muted-foreground ml-0.5">({OT_HOUR[r.shift] ?? ''})</span></>
                                                                        ) : <span className="text-muted-foreground">—</span>}
                                                                    </span>
                                                                )}
                                                            </td>
                                                            {/* Chay — editable */}
                                                            <td className="px-3 py-2.5 text-right">
                                                                {editingCell?.row === i && editingCell?.field === 'vegetarian' ? (
                                                                    <input autoFocus type="number" value={editDraft}
                                                                        onChange={e => setEditDraft(e.target.value)}
                                                                        onBlur={() => commitEdit(i, 'vegetarian')}
                                                                        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditingCell(null) }}
                                                                        className="w-16 text-right border border-blue-400 rounded px-1 py-0 text-sm bg-blue-50 focus:outline-none" />
                                                                ) : (
                                                                    <span className={`cursor-pointer hover:ring-1 hover:ring-blue-300 rounded px-1 ${r.vegetarian != null && r.vegetarian > 0 ? 'font-semibold text-emerald-600' : 'text-muted-foreground'}`}
                                                                        title="Click để sửa"
                                                                        onClick={() => { setEditingCell({ row: i, field: 'vegetarian' }); setEditDraft(String(r.vegetarian ?? '')) }}>
                                                                        {r.vegetarian != null && r.vegetarian > 0 ? r.vegetarian : '—'}
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
                                                                        <span className="text-xs text-amber-600 font-semibold">⚠ Không rõ: &quot;{effArea}&quot;</span>
                                                                         <select
                                                                             className="text-xs border border-amber-300 rounded px-1 py-0.5 bg-amber-50 focus:outline-none focus:ring-1 focus:ring-amber-400"
                                                                             value={areaOverrides[i] ?? ""}
                                                                             onChange={(e) => setAreaOverrides(prev => ({ ...prev, [i]: e.target.value }))}
                                                                         >
                                                                             <option value="">-- Chọn bộ phận --</option>
                                                                             {deptList.map(d => (
                                                                                 <option key={d.id} value={d.name_en}>{d.name_en}</option>
                                                                             ))}
                                                                         </select>
                                                                     </div>
                                                                 ) : (
                                                                     <span className="text-xs text-muted-foreground">—</span>
                                                                 )}
                                                             </td>
                                                             {/* Source toggle */}
                                                             <td className="px-2 py-2 text-center">
                                                                 {r.raw ? (
                                                                     <button
                                                                         onClick={() => toggleSource(i)}
                                                                         title="Xem nguồn"
                                                                         className={`text-xs px-1.5 py-0.5 rounded border transition-colors ${
                                                                             expandedSource.has(i)
                                                                                 ? 'bg-slate-200 border-slate-400 text-slate-700'
                                                                                 : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                                                                         }`}
                                                                     >
                                                                         {expandedSource.has(i) ? '▲ Ẩn' : '▼ Xem'}
                                                                     </button>
                                                                 ) : <span className="text-muted-foreground text-xs">—</span>}
                                                             </td>
                                                             {/* Per-row confirm */}
                                                             <td className="px-2 py-2 text-center">
                                                                 {canSave && (
                                                                     confirmedRows.has(i) ? (
                                                                         <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                                                                             <CheckCircle2 className="h-3 w-3" /> Đã lưu
                                                                         </span>
                                                                     ) : (
                                                                         <button
                                                                             onClick={() => handleConfirmOne(i)}
                                                                             disabled={confirmingRow === i}
                                                                             className="text-xs font-semibold px-2.5 py-0.5 rounded-full border bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-600 hover:text-white transition-colors disabled:opacity-50"
                                                                         >
                                                                             {confirmingRow === i ? '...' : '✓ Lưu'}
                                                                         </button>
                                                                     )
                                                                 )}
                                                                 {confirmMsg[i] && !confirmedRows.has(i) && (
                                                                     <div className={`text-[10px] mt-0.5 ${
                                                                         confirmMsg[i].type === 'ok' ? 'text-emerald-600' : 'text-red-500'
                                                                     }`}>{confirmMsg[i].text}</div>
                                                                 )}
                                                             </td>
                                                        </tr>
                                                        {/* Expandable source row */}
                                                        {expandedSource.has(i) && r.raw && (
                                                            <tr className="bg-slate-50 border-b border-slate-100">
                                                                <td colSpan={13} className="px-4 py-2">
                                                                    <div className="flex items-start gap-2">
                                                                        <span className="text-[10px] font-bold uppercase text-slate-400 mt-0.5 shrink-0">Nguồn:</span>
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
                                                        TỔNG ({records.length} khu vực)
                                                    </td>
                                                    <td className="px-3 py-2.5 text-right text-green-700">{summary.totalOfficial}</td>
                                                    <td className="px-3 py-2.5 text-right text-red-600">{summary.totalAbsent}</td>
                                                    <td className="px-3 py-2.5 text-right">{summary.totalSeasonal}</td>
                                                    <td className="px-3 py-2.5 text-right">—</td>
                                                    <td className="px-3 py-2.5 text-right">—</td>
                                                    <td className="px-3 py-2.5 text-right text-emerald-600">
                                                        {summary.totalVeg > 0 ? summary.totalVeg : "—"}
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
                                    <RefreshCw className="h-3 w-3" /> Paste dữ liệu mới
                                </Button>
                            </div>
                        </>
                    )}
                </>
            )}

            {/* ═══════════════════════════════════════════ */}
            {/* TAB 2: HISTORY                              */}
            {/* ═══════════════════════════════════════════ */}
            {activeTab === "history" && (() => {
                // Build pivot from historyRecords
                // rows: dept×shift, cols: dates
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
                        present: (r.official_present ?? 0) + (r.seasonal_present ?? 0),
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
                                <label className="text-xs font-semibold text-muted-foreground block mb-1">Từ ngày</label>
                                <input type="date" value={historyFrom}
                                    onChange={e => setHistoryFrom(e.target.value)}
                                    className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-muted-foreground block mb-1">Đến ngày</label>
                                <input type="date" value={historyTo}
                                    onChange={e => setHistoryTo(e.target.value)}
                                    className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                            </div>
                            {/* Quick-pick buttons */}
                            <div className="flex gap-1.5" style={{paddingBottom:'0px'}}>
                                {([
                                    { label: '7 ngày', days: 6 },
                                    { label: '14 ngày', days: 13 },
                                    { label: '30 ngày', days: 29 },
                                ] as { label: string; days: number }[]).map(opt => {
                                    const to = new Date().toISOString().slice(0, 10)
                                    const from = (() => { const d = new Date(); d.setDate(d.getDate() - opt.days); return d.toISOString().slice(0, 10) })()
                                    const active = historyFrom === from && historyTo === to
                                    return (
                                        <button key={opt.label}
                                            onClick={() => { setHistoryFrom(from); setHistoryTo(to) }}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                                                active ? 'bg-primary text-white border-primary' : 'bg-background text-muted-foreground border-input hover:bg-muted'
                                            }`}>
                                            {opt.label}
                                        </button>
                                    )
                                })}
                            </div>
                            <Button onClick={fetchHistory} disabled={historyLoading} className="gap-2">
                                <CalendarDays className="h-4 w-4" />
                                {historyLoading ? 'Đang tải...' : 'Xem dữ liệu'}
                            </Button>
                            {historyRecords.length > 0 && (
                                <Button variant="outline" onClick={() => exportHistoryCSV(historyRecords)}
                                    className="gap-2 text-green-700 border-green-300 hover:bg-green-50">
                                    <FileSpreadsheet className="h-4 w-4" />
                                    Xuất CSV
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* Pivot table */}
                    {historyLoading ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-3" />
                            Đang tải dữ liệu...
                        </div>
                    ) : historyRecords.length === 0 ? (
                        <div className="bg-muted/30 rounded-xl border p-8 text-center text-muted-foreground">
                            <Database className="h-10 w-10 mx-auto mb-3 opacity-40" />
                            <p className="font-medium">Chưa có dữ liệu trong khoảng thời gian này</p>
                            <p className="text-sm mt-1">Paste dữ liệu Zalo ở tab &quot;Nhập &amp; Phân tích&quot; rồi bấm Lưu vào DB</p>
                        </div>
                    ) : (
                        <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
                            <div className="px-4 py-3 border-b bg-muted/40 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <History className="h-4 w-4 text-muted-foreground" />
                                    <span className="font-semibold text-sm">
                                        Lịch sử — {pivotDays.length} ngày · {pivotRows.length} bộ phận/ca
                                    </span>
                                </div>
                                <span className="text-xs text-muted-foreground">Số liệu: CT + TV hiện diện</span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="text-xs min-w-full">
                                    <thead>
                                        <tr className="bg-muted/60 text-muted-foreground">
                                            <th className="px-3 py-2 text-left font-semibold sticky left-0 bg-muted/60 min-w-[120px]">Bộ phận</th>
                                            <th className="px-2 py-2 text-center font-semibold sticky left-[120px] bg-muted/60 min-w-[44px]">Ca</th>
                                            {pivotDays.map(d => (
                                                <th key={d} className="px-2 py-2 text-center font-semibold min-w-[42px] whitespace-nowrap">
                                                    {parseInt(d.slice(8), 10)}/{parseInt(d.slice(5,7), 10)}
                                                </th>
                                            ))}
                                            <th className="px-2 py-2 text-center font-bold min-w-[48px] text-primary">TỔNG</th>
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
                                                                ) : <span className="text-muted-foreground/40">—</span>}
                                                            </td>
                                                        )
                                                    })}
                                                    <td className="px-2 py-2 text-center font-bold text-primary border-l">{rowTotal || '—'}</td>
                                                    {canEdit && (
                                                        <td className="px-2 py-2 text-center">
                                                            <div className="flex items-center justify-center gap-1">
                                                                {/* Edit: go to kitchen tab for the latest date of this row */}
                                                                <button
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
                                                                    title="Sửa số liệu"
                                                                >
                                                                    ✏️
                                                                </button>
                                                                {/* Delete */}
                                                                <button
                                                                    onClick={async () => {
                                                                        if (!confirm(`Xóa TẤT CẢ bản ghi của "${row.deptName}" Ca ${row.shift} trong khoảng ngày đã chọn?`)) return
                                                                        const ids = historyRecords
                                                                            .filter(r => (r.department_id ?? r.department_name) + '|' + r.shift === key)
                                                                            .map(r => r.id)
                                                                        await supabase.from('meal_headcount').delete().in('id', ids)
                                                                        setHistoryRecords(prev => prev.filter(r => !ids.includes(r.id)))
                                                                    }}
                                                                    className="text-red-400 hover:text-red-600 hover:bg-red-50 rounded px-1.5 py-0.5 text-xs transition-colors"
                                                                    title="Xóa hàng này"
                                                                >
                                                                    🗑
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
                                            <td colSpan={2} className="px-3 py-2 sticky left-0 bg-muted/60">TỔNG NGÀY</td>
                                            {pivotDays.map(d => {
                                                const total = historyRecords
                                                    .filter(r => r.work_date === d)
                                                    .reduce((s, r) => s + (r.official_present ?? 0) + (r.seasonal_present ?? 0), 0)
                                                return <td key={d} className="px-2 py-2 text-center text-primary">{total || '—'}</td>
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
