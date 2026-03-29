"use client"

import { useState, useCallback, useEffect, Fragment } from "react"
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

// CÃ¡c bá»™ pháº­n cáº§n bÃ¡o cÆ¡m theo code trong DB
const EXPECTED_DEPTS = [
    "PEEL", "CS", "STEAM", "PACK", "BORMA", "SHELL", "BOILER", "QC", "FGWH", "HPEEL", "MAINT_SHELL", "MAINT_HCA", "OFFICE"
]

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Billing cycle helper: chá»n thÃ¡ng M/YYYY â†’ chu ká»³ 26/(M-1) â†’ 25/M
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function getBillingCycle(monthStr: string): { from: string; to: string; label: string } {
    // monthStr = "YYYY-MM"
    const [year, month] = monthStr.split("-").map(Number)
    // Start: ngÃ y 26 thÃ¡ng trÆ°á»›c
    const prevMonth = month === 1 ? 12 : month - 1
    const prevYear = month === 1 ? year - 1 : year
    const from = `${prevYear}-${String(prevMonth).padStart(2, "0")}-26`
    // End: ngÃ y 25 thÃ¡ng hiá»‡n táº¡i
    const to = `${year}-${String(month).padStart(2, "0")}-25`
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
    note: string | null
    created_at: string
}

interface MealStatRow {
    work_date: string
    department_id: string | null
    department_name: string
    shift: string
    official_present: number | null
    seasonal_present: number | null
    ot_count: number | null
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
    // â”€â”€ HANDPEELING (Manual Grading Ms Huá»‡ + Manual Peeling LiÃªn/Dung) â”€â”€
    "manual grading -shift 1 (ms huá»‡)": "HPEEL_GRADING",
    "manual grading thá»i vá»¥ -shift 1 (ms huá»‡)": "HPEEL_GRADING",
    "manual grading -shift 2 (ms huá»‡)": "HPEEL_GRADING",
    "manual grading thá»i vá»¥ -shift 2 (ms huá»‡)": "HPEEL_GRADING",
    "manual grading -shift 3 (ms huá»‡)": "HPEEL_GRADING",
    "manual grading thá»i vá»¥ -shift 3 (ms huá»‡)": "HPEEL_GRADING",
    "manual grading": "HPEEL_GRADING",
    "manual peeling s1 - liÃªn": "HPEEL_LIEN",
    "manual peeling s1 thá»i vá»¥ - liÃªn": "HPEEL_LIEN",
    "manual peeling s1 - dung": "HPEEL_DUNG",
    "manual peeling s1 thá»i vá»¥ - dung": "HPEEL_DUNG",
    "manual peeling s2 - liÃªn": "HPEEL_LIEN",
    "manual peeling s2 thá»i vá»¥ - liÃªn": "HPEEL_LIEN",
    "manual peeling s2 - dung": "HPEEL_DUNG",
    "manual peeling s2 thá»i vá»¥ - dung": "HPEEL_DUNG",
    "manual peeling s3 - liÃªn": "HPEEL_LIEN",
    "manual peeling s3 thá»i vá»¥ - liÃªn": "HPEEL_LIEN",
    "manual peeling s3 - dung": "HPEEL_DUNG",
    "manual peeling s3 thá»i vá»¥ - dung": "HPEEL_DUNG",
    "manual peeling": "HPEEL",
    "handpeeling": "HPEEL",
    // Zalo aliases (grading â†’ handpeeling)
    "grading": "HPEEL_GRADING",
    "gradin": "HPEEL_GRADING",
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
    // â”€â”€ CLEANING â”€â”€
    "cleaning worker": "MAINT_HCA",
    "cleaning worker s2": "MAINT_HCA",
    "cleaning worker s3": "MAINT_HCA",
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
    HPEEL_LIEN:    'Manual Peeling (Li\u00ean)',
    HPEEL_DUNG:    'Manual Peeling (Dung)',
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

    let shift = getField(text, ["ca"])
    const inlineShift = getField(text, ["khu vá»±c", "khu vuc"]).match(/ca\s*:\s*(\S+)/i)
    if (inlineShift) shift = inlineShift[1]
    shift = shift.replace(/\./g, ", ").trim()
    // Strip trailing descriptive text like "vÃ  HC", "vÃ  Highcare" after the shift number
    shift = shift.replace(/\s+vÃ \s+.*/i, "").trim()
    // Keep only leading digits/commas/spaces (shift number part)
    const shiftOnlyMatch = shift.match(/^[\d,\s]+/)
    if (shiftOnlyMatch) shift = shiftOnlyMatch[0].trim()

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

function parseZaloText(rawText: string): HeadcountRecord[] {
    // Step 1: Strip Zalo extension triple-duplication format
    const cleanText = cleanZaloExportTriple(rawText)
    const blocks = splitIntoBlocks(cleanText)
    const records: HeadcountRecord[] = []
    for (const block of blocks) {
        // Expand multi-shift blocks (1 area, nhiá»u ca) thÃ nh records riÃªng
        const subBlocks = splitMultiShiftBlock(block)
        for (const sub of subBlocks) {
            const record = parseBlock(sub)
            if (record && (record.date || record.area !== "â€”")) records.push(record)
        }
    }
    // Step 2: Dedup by (date+area+shift), keeping last occurrence
    return deduplicateRecords(records)
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// CSV Export
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function exportCSV(records: HeadcountRecord[]) {
    const headers = ["NgÃ y", "Khu vá»±c", "Ca", "CT Hiá»‡n diá»‡n", "CT Váº¯ng", "TV Hiá»‡n diá»‡n", "TV Váº¯ng", "OT", "Chay"]
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
    const headers = ["NgÃ y", "Bá»™ pháº­n", "Ca", "CT Hiá»‡n diá»‡n", "CT Váº¯ng", "TV Hiá»‡n diá»‡n", "TV Váº¯ng", "OT", "Chay", "Ghi chÃº"]
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

// Convert DD/MM/YYYY â†’ YYYY-MM-DD for DB
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
    const [activeTab, setActiveTab] = useState<"parse" | "history" | "kitchen" | "monthly" | "train">("parse")

    const [areaOverrides, setAreaOverrides] = useState<Record<number, string>>({})
    const [showSummary, setShowSummary] = useState(false)
    const [copiedSummary, setCopiedSummary] = useState(false)

    // Helper: get effective area (overridden or parsed)
    const getEffectiveArea = (r: HeadcountRecord, i: number) => areaOverrides[i] ?? r.area
    const getEffectiveDeptId = (r: HeadcountRecord, i: number) => findDeptId(getEffectiveArea(r, i))
    const [saving, setSaving] = useState(false)
    const [saveMsg, setSaveMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null)
    const [deptList, setDeptList] = useState<{ id: string; code: string; name_en: string }[]>([])
    // "Lưu làm ví dụ dạy AI" state
    const [showSaveExample, setShowSaveExample] = useState(false)
    const [exampleTitle, setExampleTitle] = useState('')
    const [savingExample, setSavingExample] = useState(false)
    const [saveExampleMsg, setSaveExampleMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
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
    // Refresh key: tÄƒng lÃªn má»—i khi kitchen tab thay Ä‘á»•i data â†’ trigger re-fetch history
    const [historyRefreshKey, setHistoryRefreshKey] = useState(0)

    // Load departments + user role on mount
    useEffect(() => {
        async function init() {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
                if (profile) setUserRole(profile.role)
            }
            const { data: depts } = await supabase.from("departments").select("id, code, name_en").order("sort_order")
            if (depts) setDeptList(depts)
        }
        init()
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    const canSave = ["admin", "hr", "HSE", "hse", "hse_admin"].includes(userRole)

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
            const totalPresent = recs.reduce((s, r) => s + (r.officialPresent ?? 0) + (r.seasonalPresent ?? 0), 0)
            const totalVeg = recs.reduce((s, r) => s + (r.vegetarian ?? 0), 0)
            const totalOT = recs.reduce((s, r) => s + (parseInt(r.ot) || 0), 0)
            const man = totalPresent - totalVeg
            const shiftHour = SHIFT_HOUR[shift] ?? ""
            let block = `NgÃ y ${date}\nCa ${shift}: tá»•ng cá»™ng ${man} pháº§n máº·n (chay: ${totalVeg} pháº§n)`
            if (totalOT > 0) block += `\n${totalOT} OT lÃºc ${shiftHour}`
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
        if (error) { alert("Lá»—i: " + error.message); return }
        setHistoryRecords(prev => prev.map(r => r.id === id ? { ...r, ...histEditFields } : r))
        // Cáº­p nháº­t luÃ´n summaryData náº¿u Ä‘ang hiá»ƒn
        setSummaryData(prev => prev ? prev.map(r =>
            r.id === id ? { ...r, ...histEditFields } : r
        ) : prev)
        setHistEditId(null)
    }

    const handleHistDelete = async (id: string) => {
        if (!confirm("XÃ³a báº£n ghi nÃ y?")) return
        const { error } = await supabase.from("meal_headcount").delete().eq("id", id)
        if (error) { alert("Lá»—i: " + error.message); return }
        setHistoryRecords(prev => prev.filter(r => r.id !== id))
        // Cáº­p nháº­t luÃ´n summaryData náº¿u Ä‘ang hiá»ƒn
        setSummaryData(prev => prev ? prev.filter(r => r.id !== id) : prev)
    }

    // â”€â”€â”€ Monthly stats state â”€â”€â”€
    const [statsMonth, setStatsMonth] = useState<string>(() => new Date().toISOString().slice(0, 7))
    const [statsData, setStatsData] = useState<MealStatRow[] | null>(null)
    const [statsLoading, setStatsLoading] = useState(false)
    const [statsError, setStatsError] = useState<string | null>(null)

    const fetchMonthStats = async () => {
        setStatsLoading(true)
        setStatsError(null)
        setStatsData(null)
        try {
            // Chu ká»³ tiá»n cÆ¡m: 26 thÃ¡ng trÆ°á»›c â†’ 25 thÃ¡ng hiá»‡n táº¡i
            const { from, to } = getBillingCycle(statsMonth)
            const { data, error } = await supabase
                .from("meal_headcount")
                .select("work_date, department_id, department_name, shift, official_present, seasonal_present, ot_count")
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
    const DEPT_ORDER = ['FGWH','STEAM','SHELL','MAINT_SHELL','BORMA','PEEL','CS','HPEEL','PACK','BOILER','MAINT_HCA','QC','OFFICE']
    const SHIFT_ORDER = ['1','2','3','OT']

    // TÃªn hiá»ƒn thá»‹ Ä‘áº¹p nhÆ° trong Excel
    const DEPT_DISPLAY: Record<string, string> = {
        FGWH:       'Loading',
        STEAM:      'Steaming',
        SHELL:      'Shelling',
        MAINT_SHELL:'Maint. Shelling',
        BORMA:      'Borma',
        PEEL:       'Peeling (Machine)',
        CS:         'Machine Grading',
        HPEEL:      'Hand Peeling',
        PACK:       'Packing',
        BOILER:     'Boiler',
        MAINT_HCA:  'Maintenance',
        QC:         'QC',
        OFFICE:     'Office',
    }

    type ShiftEntry = { deptKey: string; deptName: string; deptCode: string; shift: string; days: Map<string, number> }
    type DeptGroup  = { deptKey: string; name: string; code: string; shifts: ShiftEntry[] }

    // Build pivot: group by dept + shift
    const buildMonthlyPivot = (rows: MealStatRow[]) => {
        const shiftMap = new Map<string, ShiftEntry>()
        rows.forEach(r => {
            const deptKey  = r.department_id ?? r.department_name
            const deptCode = deptList.find(d => d.id === r.department_id)?.code ?? ''
            const deptName = DEPT_DISPLAY[deptCode] ?? (r.department_id
                ? (deptList.find(d => d.id === r.department_id)?.name_en ?? r.department_name)
                : r.department_name)
            const shift = r.shift ?? '1'
            const mapKey = `${deptKey}|${shift}`
            if (!shiftMap.has(mapKey)) shiftMap.set(mapKey, { deptKey, deptName, deptCode, shift, days: new Map() })
            const entry = shiftMap.get(mapKey)!
            const count = (r.official_present ?? 0) + (r.seasonal_present ?? 0)
            if (count > 0) entry.days.set(r.work_date, (entry.days.get(r.work_date) ?? 0) + count)
        })
        const days = [...new Set(rows.map(r => r.work_date))].sort()
        const deptGroupMap = new Map<string, DeptGroup>()
        shiftMap.forEach(se => {
            const displayName = DEPT_DISPLAY[se.deptCode] ?? se.deptName
            if (!deptGroupMap.has(se.deptKey)) deptGroupMap.set(se.deptKey, { deptKey: se.deptKey, name: displayName, code: se.deptCode, shifts: [] })
            deptGroupMap.get(se.deptKey)!.shifts.push(se)
        })
        deptGroupMap.forEach(dg => {
            dg.shifts.sort((a, b) => {
                const ai = SHIFT_ORDER.indexOf(a.shift); const bi = SHIFT_ORDER.indexOf(b.shift)
                return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi)
            })
        })
        const deptGroups = [...deptGroupMap.values()].sort((a, b) => {
            const ai = DEPT_ORDER.indexOf(a.code); const bi = DEPT_ORDER.indexOf(b.code)
            if (ai < 0 && bi < 0) return a.name.localeCompare(b.name)
            if (ai < 0) return 1; if (bi < 0) return -1
            return ai - bi
        })
        return { days, deptGroups }
    }

    const exportMonthlyExcel = () => {
        if (!statsData || statsData.length === 0) return
        const { days, deptGroups } = buildMonthlyPivot(statsData)
        const header = ["Bá»™ pháº­n", "Ca", ...days.map(d => parseInt(d.slice(8), 10)), "Tá»”NG"]
        const dataRows: (string | number)[][] = []
        deptGroups.forEach(dept => {
            dept.shifts.forEach(sr => {
                const rowTotal = [...sr.days.values()].reduce((a, b) => a + b, 0)
                if (rowTotal === 0) return
                dataRows.push([dept.name, sr.shift === 'OT' ? 'OT' : `Ca ${sr.shift}`, ...days.map(d => sr.days.get(d) ?? 0), rowTotal])
            })
        })
        const footerRow = ["Tá»”NG NGÃ€Y", "", ...days.map(d =>
            deptGroups.reduce((s, dg) => s + dg.shifts.reduce((ss, sr) => ss + (sr.days.get(d) ?? 0), 0), 0)
        ), deptGroups.reduce((s, dg) => s + dg.shifts.reduce((ss, sr) => ss + [...sr.days.values()].reduce((a,b)=>a+b,0), 0), 0)]
        const wsData = [header, ...dataRows, footerRow]
        const ws = XLSX.utils.aoa_to_sheet(wsData)
        ws["!cols"] = [{ wch: 20 }, { wch: 6 }, ...days.map(() => ({ wch: 5 })), { wch: 8 }]
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, `CÆ¡m ${statsMonth}`)
        XLSX.writeFile(wb, `bao-com-${statsMonth}.xlsx`)
    }

    // â”€â”€â”€ DB-based summary state â”€â”€â”€
    const [summaryDate, setSummaryDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
    const [summaryShift, setSummaryShift] = useState<string>("2")
    const [summaryLoading, setSummaryLoading] = useState(false)
    const [summaryData, setSummaryData] = useState<SavedRecord[] | null>(null)
    const [summaryError, setSummaryError] = useState<string | null>(null)
    // Edit state
    const [editingRowId, setEditingRowId] = useState<string | null>(null)
    const [editFields, setEditFields] = useState<{ official_present: number; seasonal_present: number; vegetarian: number; ot_count: number }>({ official_present: 0, seasonal_present: 0, vegetarian: 0, ot_count: 0 })
    // Add-row state
    const [addRow, setAddRow] = useState<{ deptId: string; officialPresent: number; seasonalPresent: number; vegetarian: number; otCount: number } | null>(null)

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
            // Dedup: if multiple rows for same department_id, keep only the latest
            const seen = new Map<string, SavedRecord>()
            ;(data ?? []).forEach(r => {
                const key = r.department_id ?? r.department_name
                if (!seen.has(key) || r.created_at > seen.get(key)!.created_at) seen.set(key, r)
            })
            setSummaryData([...seen.values()].sort((a, b) => a.department_name.localeCompare(b.department_name)))
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e)
            setSummaryError(msg || "Lá»—i khÃ´ng xÃ¡c Ä‘á»‹nh")
        } finally {
            setSummaryLoading(false)
        }
    }

    const handleDeleteRow = async (id: string) => {
        if (!confirm("Äá»“ng Ã½ xÃ³a báº£n ghi nÃ y?")) return
        const { error } = await supabase.from("meal_headcount").delete().eq("id", id)
        if (error) {
            alert("Lá»—i xÃ³a: " + error.message)
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
        setEditFields({ official_present: r.official_present ?? 0, seasonal_present: r.seasonal_present ?? 0, vegetarian: r.vegetarian ?? 0, ot_count: r.ot_count ?? 0 })
    }

    const handleSaveEdit = async (id: string) => {
        const { error } = await supabase.from("meal_headcount").update({
            official_present: editFields.official_present,
            seasonal_present: editFields.seasonal_present,
            vegetarian: editFields.vegetarian,
            ot_count: editFields.ot_count,
            updated_at: new Date().toISOString(),
        }).eq("id", id)
        if (!error) {
            setSummaryData(prev => prev ? prev.map(r => r.id === id ? { ...r, ...editFields } : r) : prev)
            // Äá»“ng bá»™: cáº­p nháº­t luÃ´n trong historyRecords náº¿u Ä‘ang giá»¯ record Ä‘Ã³
            setHistoryRecords(prev => prev.map(r =>
                r.id === id
                    ? { ...r,
                        official_present: editFields.official_present,
                        seasonal_present: editFields.seasonal_present,
                        vegetarian: editFields.vegetarian,
                        ot_count: editFields.ot_count,
                      }
                    : r
            ))
            setHistoryRefreshKey(k => k + 1)
            setEditingRowId(null)
        }
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
            // Äá»“ng bá»™: Ä‘Ã¡nh dáº¥u Ä‘á»ƒ re-fetch lá»‹ch sá»­ khi chuyá»ƒn tab
            setHistoryRefreshKey(k => k + 1)
        } else {
            alert("Lá»—i lÆ°u: " + error.message)
        }
    }

    const buildDBSummaryText = (rows: SavedRecord[]): string => {
        const totalPresent = rows.reduce((s, r) => s + (r.official_present ?? 0) + (r.seasonal_present ?? 0), 0)
        const totalVeg = rows.reduce((s, r) => s + (r.vegetarian ?? 0), 0)
        const totalOT = rows.reduce((s, r) => s + (r.ot_count ?? 0), 0)
        const man = totalPresent - totalVeg
        const dateDisplay = format(parseISO(summaryDate), "d/M/yyyy")
        const shiftHour = SHIFT_HOUR[summaryShift] ?? ""
        let msg = `NgÃ y ${dateDisplay}\nCa ${summaryShift}: tá»•ng cá»™ng ${man} pháº§n máº·n (chay: ${totalVeg} pháº§n)`
        if (totalOT > 0) msg += `\n${totalOT} OT lÃºc ${shiftHour}`
        return msg
    }

    const getDBMissingDepts = (rows: SavedRecord[]): { code: string; name: string }[] => {
        const reported = new Set(rows.map(r =>
            r.department_id
                ? (deptList.find(d => d.id === r.department_id)?.code ?? "")
                : ""
        ))
        return EXPECTED_DEPTS
            .filter(code => !reported.has(code))
            .map(code => {
                const dept = deptList.find(d => d.code === code)
                return { code, name: dept?.name_en ?? code }
            })
    }

    // â”€â”€â”€ Parse handlers â”€â”€â”€
    const [aiParsing, setAiParsing] = useState(false)
    const [aiError, setAiError]     = useState<string | null>(null)
    const [aiTruncated, setAiTruncated] = useState(false)

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
                raw:                r.raw ?? '',
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
                const _mc = DEPT_MAP[_area.toLowerCase().trim()]
                const canonicalName = (_mc && HPEEL_SUBCODES.has(_mc))
                    ? (HPEEL_SUBGROUP_DISPLAY[_mc] ?? _area)
                    : deptId
                        ? (deptList.find(d => d.id === deptId)?.name_en ?? _area)
                        : _area
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
            setSaveMsg({ type: "ok", text: `âœ… ÄÃ£ lÆ°u ${payload.length} báº£n ghi thÃ nh cÃ´ng!` })
        } catch (err: unknown) {
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
        <div className="max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-orange-100 border border-orange-200">
                        <UtensilsCrossed className="h-6 w-6 text-orange-600" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">BÃ¡o CÆ¡m â€” Headcount Tracker</h1>
                        <p className="text-sm text-muted-foreground">
                            Paste Zalo â†’ PhÃ¢n tÃ­ch â†’ LÆ°u DB â†’ Xem lá»‹ch sá»­
                        </p>
                    </div>
                </div>
            </div>

            {/* Tab navigation */}
            <div className="flex border-b">
                <button
                    onClick={() => setActiveTab("parse")}
                    className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                        activeTab === "parse"
                            ? "border-orange-500 text-orange-600"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                >
                    <ClipboardPaste className="h-4 w-4" />
                    Nháº­p & PhÃ¢n tÃ­ch
                </button>
                <button
                    onClick={() => setActiveTab("history")}
                    className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                        activeTab === "history"
                            ? "border-blue-500 text-blue-600"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                >
                    <History className="h-4 w-4" />
                    Lá»‹ch sá»­ Ä‘Ã£ lÆ°u
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
                    ðŸ³ BÃ¡o cÆ¡m nhÃ  Äƒn
                </button>
                <button
                    onClick={() => setActiveTab("monthly")}
                    className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                        activeTab === "monthly"
                            ? "border-purple-500 text-purple-600"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                >
                    <span className="text-base leading-none">ðŸ“…</span>
                    Theo thÃ¡ng
                </button>
                {canSave && (
                    <button
                        onClick={() => setActiveTab("train")}
                        className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                            activeTab === "train"
                                ? "border-violet-500 text-violet-600"
                                : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        <span className="text-base leading-none">🧠</span>
                        Dạy AI
                    </button>
                )}
            </div>

            {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
            {/* TAB 3: KITCHEN / BÃO CÆ M NHÃ€ Ä‚N               */}
            {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
            {activeTab === "kitchen" && (
                <div className="space-y-5">
                    <div className="flex items-center gap-2 font-semibold text-green-700 text-lg">
                        <MessageSquare className="h-5 w-5" />
                        Tá»•ng há»£p bÃ¡o cÆ¡m nhÃ  Äƒn
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
                            {summaryLoading ? "Äang táº£i..." : "Tá»•ng há»£p"}
                        </button>
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
                        const missingDepts = getDBMissingDepts(summaryData)
                        return (
                            <div className="space-y-4">
                                {/* Kitchen message box */}
                                <div className="bg-white rounded-xl border-2 border-green-200 shadow-sm p-4">
                                    <div className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-2">Tin nháº¯n gá»­i nhÃ  Äƒn</div>
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
                                        {copiedSummary ? "ÄÃ£ copy!" : "Copy tin nháº¯n"}
                                    </button>
                                </div>

                                {/* Per-dept breakdown */}
                                <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
                                    <div className="flex items-center justify-between px-4 py-2.5 bg-muted/40 border-b">
                                        <span className="text-sm font-semibold">Chi tiáº¿t tá»«ng bá»™ pháº­n</span>
                                        <button
                                            onClick={() => setAddRow({ deptId: "", officialPresent: 0, seasonalPresent: 0, vegetarian: 0, otCount: 0 })}
                                            className="flex items-center gap-1 text-xs font-semibold text-green-700 hover:text-green-900 bg-green-50 border border-green-200 px-2 py-1 rounded-lg transition-colors"
                                        >
                                            <span className="text-base leading-none">+</span> ThÃªm bá»™ pháº­n
                                        </button>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="bg-muted/40 text-xs text-muted-foreground uppercase tracking-wide text-left">
                                                    <th className="px-3 py-2 font-semibold">Bá»™ pháº­n</th>
                                                    <th className="px-3 py-2 font-semibold text-right">CT HÄ</th>
                                                    <th className="px-3 py-2 font-semibold text-right">TV HÄ</th>
                                                    <th className="px-3 py-2 font-semibold text-right">Tá»•ng</th>
                                                    <th className="px-3 py-2 font-semibold text-right text-emerald-600">ðŸ¥¦ Chay</th>
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
                                                                    <button onClick={() => handleSaveEdit(r.id)} className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded hover:bg-blue-700 mr-1">LÆ°u</button>
                                                                    <button onClick={() => setEditingRowId(null)} className="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded hover:bg-gray-300">Há»§y</button>
                                                                </td>
                                                            </>) : (<>
                                                                <td className="px-3 py-2 text-right font-semibold text-green-700">{r.official_present ?? 0}</td>
                                                                <td className="px-3 py-2 text-right">{r.seasonal_present ?? 0}</td>
                                                                <td className="px-3 py-2 text-right font-bold">{(r.official_present ?? 0) + (r.seasonal_present ?? 0)}</td>
                                                                <td className="px-3 py-2 text-right text-emerald-600 font-semibold">{r.vegetarian ?? 0}</td>
                                                                <td className="px-3 py-2 text-right">{r.ot_count ?? 0}</td>
                                                                <td className="px-2 py-2 whitespace-nowrap">
                                                                    <button onClick={() => handleStartEdit(r)} className="text-xs text-blue-600 hover:underline mr-2">âœï¸ Sá»­a</button>
                                                                    <button onClick={() => handleDeleteRow(r.id)} className="text-xs text-red-500 hover:underline">ðŸ—‘</button>
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
                                                            <button onClick={handleAddRowSave} className="text-xs bg-green-600 text-white px-2 py-0.5 rounded hover:bg-green-700 mr-1">LÆ°u</button>
                                                            <button onClick={() => setAddRow(null)} className="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded">Há»§y</button>
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                            <tfoot>
                                                <tr className="bg-muted/60 font-bold border-t-2 text-sm">
                                                    <td className="px-3 py-2">Tá»”NG</td>
                                                    <td className="px-3 py-2 text-right text-green-700">{summaryData.reduce((s, r) => s + (r.official_present ?? 0), 0)}</td>
                                                    <td className="px-3 py-2 text-right">{summaryData.reduce((s, r) => s + (r.seasonal_present ?? 0), 0)}</td>
                                                    <td className="px-3 py-2 text-right">{summaryData.reduce((s, r) => s + (r.official_present ?? 0) + (r.seasonal_present ?? 0), 0)}</td>
                                                    <td className="px-3 py-2 text-right text-emerald-600">{summaryData.reduce((s, r) => s + (r.vegetarian ?? 0), 0)}</td>
                                                    <td className="px-3 py-2 text-right">{summaryData.reduce((s, r) => s + (r.ot_count ?? 0), 0)}</td>
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
                        <button
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
                            <button
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
                        const dayTotals = days.map(d =>
                            deptGroups.reduce((s, dg) => s + dg.shifts.reduce((ss, sr) => ss + (sr.days.get(d) ?? 0), 0), 0)
                        )
                        const grandTotal = dayTotals.reduce((a, b) => a + b, 0)
                        return (
                            <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
                                <div className="px-4 py-2.5 bg-muted/40 border-b text-sm font-semibold flex items-center justify-between">
                                    <span>ThÃ¡ng {statsMonth} â€” chu ká»³ {getBillingCycle(statsMonth).label}</span>
                                    <button onClick={exportMonthlyExcel} className="flex items-center gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg transition-colors">
                                        <FileSpreadsheet className="h-3.5 w-3.5" /> Xuáº¥t Excel
                                    </button>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="text-xs min-w-full">
                                        <thead>
                                            <tr className="bg-muted/40 text-muted-foreground">
                                                <th className="px-3 py-2 font-semibold text-left sticky left-0 bg-muted/40 z-10 min-w-[140px] whitespace-nowrap">Bá»™ pháº­n / Ca</th>
                                                {days.map(d => <th key={d} className="px-2 py-2 font-semibold text-center whitespace-nowrap">{parseInt(d.slice(8), 10)}</th>)}
                                                <th className="px-3 py-2 font-bold text-right text-purple-700 whitespace-nowrap">Tá»”NG</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {deptGroups.map(dept => (
                                                <Fragment key={dept.deptKey}>
                                                    {/* Dept header row */}
                                                    <tr className="bg-purple-50 border-t-2 border-purple-200">
                                                        <td colSpan={days.length + 2} className="px-3 py-1 font-bold text-purple-800 text-xs uppercase tracking-wide sticky left-0 bg-purple-50 z-10">
                                                            {dept.name}
                                                        </td>
                                                    </tr>
                                                    {/* Shift rows */}
                                                    {dept.shifts.map(sr => {
                                                        const rowTotal = [...sr.days.values()].reduce((a, b) => a + b, 0)
                                                        if (rowTotal === 0) return null
                                                        const isOT = sr.shift === 'OT'
                                                        return (
                                                            <tr key={`${dept.deptKey}|${sr.shift}`} className={isOT ? "bg-orange-50/60" : "hover:bg-muted/30"}>
                                                                <td className={`px-3 py-1.5 whitespace-nowrap sticky left-0 z-10 pl-6 font-medium ${isOT ? "bg-orange-50/60 text-orange-700" : "bg-white"}`}>
                                                                    {isOT ? "â± OT" : `Ca ${sr.shift}`}
                                                                </td>
                                                                {days.map(d => {
                                                                    const v = sr.days.get(d) ?? 0
                                                                    return (
                                                                        <td key={d} className={`px-2 py-1.5 text-center ${v > 0 ? (isOT ? "text-orange-600 font-semibold" : "font-semibold text-foreground") : "text-muted-foreground/30"}`}>
                                                                            {v > 0 ? v : "â€”"}
                                                                        </td>
                                                                    )
                                                                })}
                                                                <td className={`px-3 py-1.5 text-right font-bold ${isOT ? "text-orange-600" : "text-purple-700"}`}>{rowTotal}</td>
                                                            </tr>
                                                        )
                                                    })}
                                                </Fragment>
                                            ))}
                                        </tbody>
                                        <tfoot>
                                            <tr className="bg-muted/60 font-bold border-t-2">
                                                <td className="px-3 py-2 sticky left-0 bg-muted/60 z-10">Tá»”NG NGÃ€Y</td>
                                                {dayTotals.map((v, i) => <td key={days[i]} className="px-2 py-2 text-center text-purple-700">{v > 0 ? v : ""}</td>)}
                                                <td className="px-3 py-2 text-right text-purple-700">{grandTotal}</td>
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
            {activeTab === "parse" && (
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
                                {canSave && records.length > 0 && (
                                    <Button
                                        size="sm"
                                        onClick={() => { setShowSaveExample(s => !s); setSaveExampleMsg(null) }}
                                        className="gap-2 bg-violet-600 hover:bg-violet-700 text-white"
                                    >
                                        <span>&#x1F9E0;</span>
                                        L&#x01B0;u l&#xE0;m v&#xED; d&#x1EE5; d&#x1EA1;y AI
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

                            {/* Mini form: luu lam vi du day AI */}
                            {showSaveExample && (
                                <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 space-y-3">
                                    <p className="text-sm font-semibold text-violet-700">&#x1F9E0; L&#x01B0;u k&#x1EBF;t qu&#x1EA3; n&#xE0;y l&#xE0;m v&#xED; d&#x1EE5; d&#x1EA1;y AI</p>
                                    <p className="text-xs text-violet-600">
                                        H&#x1EC7; th&#x1ED1;ng s&#x1EBD; t&#x1EF1; l&#x01B0;u &#x0111;o&#x1EA1;n Zalo b&#x1EA1;n &#x0111;&#xE3; paste + b&#x1EA3;ng hi&#x1EC7;n t&#x1EA1;i (sau khi b&#x1EA1;n ch&#x1EC9;nh s&#x1EED;a) l&#xE0;m v&#xED; d&#x1EE5; hu&#x1EA5;n luy&#x1EC7;n. Kh&#xF4;ng c&#x1EA7;n nh&#x1EAD;p JSON th&#x1EE7; c&#xF4;ng.
                                    </p>
                                    <div className="flex gap-2 items-center flex-wrap">
                                        <input
                                            value={exampleTitle}
                                            onChange={e => setExampleTitle(e.target.value)}
                                            placeholder="&#x0110;&#x1EB7;t t&#xEA;n v&#xED; d&#x1EE5; (VD: Ch&#xE2;u MC Peeling Ca 2)"
                                            className="flex-1 min-w-[200px] border border-violet-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white"
                                        />
                                        <button
                                            disabled={savingExample || !exampleTitle.trim()}
                                            onClick={async () => {
                                                setSavingExample(true)
                                                setSaveExampleMsg(null)
                                                const expectedJson = records.map((r, i) => ({
                                                    senderHint: r.senderHint ?? ``,
                                                    date: r.date,
                                                    area: getEffectiveArea(r, i),
                                                    shift: r.shift,
                                                    officialPresent: r.officialPresent ?? 0,
                                                    officialPresentNote: r.officialPresentNote ?? ``,
                                                    officialAbsent: r.officialAbsent ?? 0,
                                                    seasonalPresent: r.seasonalPresent ?? 0,
                                                    seasonalAbsent: r.seasonalAbsent ?? 0,
                                                    ot: r.ot ?? ``,
                                                    vegetarian: r.vegetarian ?? null,
                                                }))
                                                const areas = [...new Set(expectedJson.map(r => r.area))]
                                                const deptHint = areas.length === 1 ? areas[0] : areas.join(`,`)
                                                const { error } = await supabase.from(`meal_ai_examples`).insert({
                                                    title: exampleTitle.trim(),
                                                    input_text: rawText.trim(),
                                                    expected_json: expectedJson,
                                                    dept_hint: deptHint || null,
                                                    is_active: true,
                                                })
                                                setSavingExample(false)
                                                if (error) {
                                                    setSaveExampleMsg({ type: `err`, text: `L&#x1ED7;i l&#x01B0;u: ` + error.message })
                                                } else {
                                                    setSaveExampleMsg({ type: `ok`, text: `&#x2705; &#x0110;&#xE3; l&#x01B0;u v&#xED; d&#x1EE5;! AI s&#x1EBD; h&#x1ECD;c t&#x1EEB; v&#xED; d&#x1EE5; n&#xE0;y l&#x1EA7;n sau.` })
                                                    setExampleTitle(``)
                                                    setTimeout(() => setShowSaveExample(false), 2500)
                                                }
                                            }}
                                            className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
                                        >
                                            {savingExample ? `&#x0110;ang l&#x01B0;u...` : `&#x1F4BE; L&#x01B0;u ngay`}
                                        </button>
                                        <button
                                            onClick={() => setShowSaveExample(false)}
                                            className="px-3 py-2 rounded-lg border text-sm text-muted-foreground hover:bg-muted"
                                        >H&#x1EE7;y</button>
                                    </div>
                                    {saveExampleMsg && (
                                        <div className={`text-sm px-3 py-2 rounded-lg border ${
                                            saveExampleMsg.type === `ok`
                                                ? `bg-green-50 text-green-700 border-green-200`
                                                : `bg-red-50 text-red-700 border-red-200`
                                        }`}>{saveExampleMsg.text}</div>
                                    )}
                                </div>
                            )}

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
                                            {summaryLoading ? "Äang táº£i..." : "Tá»•ng há»£p"}
                                        </button>
                                    </div>

                                    {summaryError && (
                                        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{summaryError}</div>
                                    )}

                                    {summaryData !== null && (() => {
                                        if (summaryData.length === 0) return (
                                            <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                                KhÃ´ng cÃ³ dá»¯ liá»‡u cho ngÃ y nÃ y â€” cÃ³ thá»ƒ chÆ°a lÆ°u hoáº·c chÆ°a bÃ¡o Ä‘á»§.
                                            </div>
                                        )
                                        const msgText = buildDBSummaryText(summaryData)
                                        const missingDepts = getDBMissingDepts(summaryData)
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
                                                    {copiedSummary ? "ÄÃ£ copy!" : "Copy tin nháº¯n"}
                                                </button>

                                                {/* Per-dept breakdown */}
                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-xs border rounded-lg overflow-hidden">
                                                        <thead>
                                                            <tr className="bg-orange-100 text-orange-700 text-left">
                                                                <th className="px-2 py-1.5 font-semibold">Bá»™ pháº­n</th>
                                                                <th className="px-2 py-1.5 font-semibold text-right">CT HÄ</th>
                                                                <th className="px-2 py-1.5 font-semibold text-right">TV HÄ</th>
                                                                <th className="px-2 py-1.5 font-semibold text-right">Chay</th>
                                                                <th className="px-2 py-1.5 font-semibold text-right">OT</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y">
                                                            {summaryData.map(r => (
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
                                <div className={`rounded-lg px-4 py-2.5 text-sm font-medium ${
                                    saveMsg.type === "ok"
                                        ? "bg-green-50 text-green-700 border border-green-200"
                                        : "bg-red-50 text-red-700 border border-red-200"
                                }`}>
                                    {saveMsg.text}
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
                                        <span className="text-xs text-muted-foreground">
                                            CT = ChÃ­nh thá»©c &nbsp;Â·&nbsp; TV = Thá»i vá»¥
                                        </span>
                                    </div>

                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="bg-muted/60 text-left text-xs text-muted-foreground uppercase tracking-wide">
                                                    <th className="px-3 py-2.5 font-semibold">#</th>
                                                    <th className="px-3 py-2.5 font-semibold">NgÃ y</th>
                                                    <th className="px-3 py-2.5 font-semibold">Khu vá»±c</th>
                                                    <th className="px-3 py-2.5 font-semibold">Ca</th>
                                                    <th className="px-3 py-2.5 font-semibold text-right">CT HÄ</th>
                                                    <th className="px-3 py-2.5 font-semibold text-right">CT Váº¯ng</th>
                                                    <th className="px-3 py-2.5 font-semibold text-right">TV HÄ</th>
                                                    <th className="px-3 py-2.5 font-semibold text-right">TV Váº¯ng</th>
                                                    <th className="px-3 py-2.5 font-semibold text-right">OT</th>
                                                    <th className="px-3 py-2.5 font-semibold text-right">ðŸ¥¦ Chay</th>
                                                    <th className="px-3 py-2.5 font-semibold">DB Link</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y">
                                                {records.map((r, i) => {
                                                    const effArea = getEffectiveArea(r, i)
                                                    const deptId = getEffectiveDeptId(r, i)
                                                    const linked = deptList.find((d) => d.id === deptId)
                                                    const isUnknown = !linked && !hasDeptRule(effArea)
                                                    return (
                                                        <tr key={i} className="hover:bg-muted/30 transition-colors">
                                                            <td className="px-3 py-2.5 text-muted-foreground">{i + 1}</td>
                                                            <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap">
                                                                {r.date || <span className="text-yellow-500">?</span>}
                                                            </td>
                                                            <td className="px-3 py-2.5 font-medium whitespace-nowrap">{effArea}</td>
                                                            <td className="px-3 py-2.5 text-center">
                                                                <span className="inline-block bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                                                                    Ca {r.shift}
                                                                </span>
                                                            </td>
                                                            <td className="px-3 py-2.5 text-right">
                                                                {r.officialPresent != null ? (
                                                                    <span className="font-bold text-green-700">
                                                                        {r.officialPresent}
                                                                        {r.officialPresentNote && (
                                                                            <span className="text-xs font-normal text-muted-foreground ml-1">{r.officialPresentNote}</span>
                                                                        )}
                                                                    </span>
                                                                ) : <span className="text-muted-foreground">â€”</span>}
                                                            </td>
                                                            <td className="px-3 py-2.5 text-right">
                                                                {r.officialAbsent != null ? (
                                                                    <span className={r.officialAbsent > 0 ? "font-bold text-red-600" : "text-muted-foreground"}>
                                                                        {r.officialAbsent}
                                                                    </span>
                                                                ) : <span className="text-muted-foreground">â€”</span>}
                                                            </td>
                                                            <td className="px-3 py-2.5 text-right">
                                                                {r.seasonalPresent != null ? r.seasonalPresent : <span className="text-muted-foreground">â€”</span>}
                                                            </td>
                                                            <td className="px-3 py-2.5 text-right">
                                                                {r.seasonalAbsent != null ? r.seasonalAbsent : <span className="text-muted-foreground">â€”</span>}
                                                            </td>
                                                            <td className="px-3 py-2.5 text-right text-xs">{r.ot || "0"}</td>
                                                            <td className="px-3 py-2.5 text-right">
                                                                {r.vegetarian != null && r.vegetarian > 0 ? (
                                                                    <span className="font-semibold text-emerald-600">{r.vegetarian}</span>
                                                                ) : <span className="text-muted-foreground">â€”</span>}
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
                                                        </tr>
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
                            <div className="flex gap-1.5" style={{paddingBottom:'0px'}}>
                                {([
                                    { label: '7 ngÃ y', days: 6 },
                                    { label: '14 ngÃ y', days: 13 },
                                    { label: '30 ngÃ y', days: 29 },
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
                                <span className="text-xs text-muted-foreground">Sá»‘ liá»‡u: CT + TV hiá»‡n diá»‡n</span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="text-xs min-w-full">
                                    <thead>
                                        <tr className="bg-muted/60 text-muted-foreground">
                                            <th className="px-3 py-2 text-left font-semibold sticky left-0 bg-muted/60 min-w-[120px]">Bá»™ pháº­n</th>
                                            <th className="px-2 py-2 text-center font-semibold sticky left-[120px] bg-muted/60 min-w-[44px]">Ca</th>
                                            {pivotDays.map(d => (
                                                <th key={d} className="px-2 py-2 text-center font-semibold min-w-[42px] whitespace-nowrap">
                                                    {parseInt(d.slice(8), 10)}/{parseInt(d.slice(5,7), 10)}
                                                </th>
                                            ))}
                                            <th className="px-2 py-2 text-center font-bold min-w-[48px] text-primary">Tá»”NG</th>
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
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
                )
            })()}

            {/* ═══════════════════════════════════════════ */}
            {/* TAB 5: DẠY AI                               */}
            {/* ═══════════════════════════════════════════ */}
            {activeTab === "train" && <TrainAITab supabase={supabase} />}

        </div>
    )
}

// ─── Sub-component: TrainAITab ────────────────────────────────────────────────
type AIExample = {
    id: string
    title: string
    input_text: string
    expected_json: unknown
    dept_hint: string | null
    is_active: boolean
    created_at: string
}

function TrainAITab({ supabase }: { supabase: ReturnType<typeof import('@/lib/supabase/client').createClient> }) {
    const [examples, setExamples] = useState<AIExample[]>([])
    const [loading, setLoading] = useState(true)
    const [showForm, setShowForm] = useState(false)
    const [saving, setSaving] = useState(false)
    const [expandedId, setExpandedId] = useState<string | null>(null)

    // Form state
    const [formTitle, setFormTitle] = useState('')
    const [formInput, setFormInput] = useState('')
    const [formJson, setFormJson] = useState('')
    const [formDept, setFormDept] = useState('')
    const [formErr, setFormErr] = useState<string | null>(null)

    const loadExamples = useCallback(async () => {
        setLoading(true)
        const { data } = await supabase
            .from('meal_ai_examples')
            .select('*')
            .order('created_at', { ascending: false })
        setExamples((data ?? []) as AIExample[])
        setLoading(false)
    }, [supabase])

    useEffect(() => { loadExamples() }, [loadExamples])

    const handleToggleActive = async (ex: AIExample) => {
        await supabase.from('meal_ai_examples').update({ is_active: !ex.is_active }).eq('id', ex.id)
        setExamples(prev => prev.map(e => e.id === ex.id ? { ...e, is_active: !ex.is_active } : e))
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Xóa ví dụ này?')) return
        await supabase.from('meal_ai_examples').delete().eq('id', id)
        setExamples(prev => prev.filter(e => e.id !== id))
    }

    const handleSubmit = async () => {
        setFormErr(null)
        if (!formTitle.trim()) { setFormErr('Cần nhập tiêu đề'); return }
        if (!formInput.trim()) { setFormErr('Cần nhập text Zalo mẫu'); return }
        if (!formJson.trim()) { setFormErr('Cần nhập JSON kết quả mong muốn'); return }
        let parsedJson: unknown
        try { parsedJson = JSON.parse(formJson) }
        catch { setFormErr('JSON không hợp lệ — kiểm tra lại cú pháp'); return }

        setSaving(true)
        const { error } = await supabase.from('meal_ai_examples').insert({
            title: formTitle.trim(),
            input_text: formInput.trim(),
            expected_json: parsedJson,
            dept_hint: formDept.trim() || null,
            is_active: true,
        })
        setSaving(false)
        if (error) { setFormErr('Lỗi lưu: ' + error.message); return }
        setFormTitle(''); setFormInput(''); setFormJson(''); setFormDept('')
        setShowForm(false)
        await loadExamples()
    }

    const activeCount = examples.filter(e => e.is_active).length

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h2 className="text-lg font-bold flex items-center gap-2">
                        <span>🧠</span> Dạy AI – Few-shot Examples
                    </h2>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Thêm ví dụ thực tế để AI học cách parse đúng hơn cho nhà máy của bạn.
                        {' '}<span className="font-semibold text-violet-700">{activeCount} ví dụ đang được dùng</span> trong mỗi lần AI phân tích.
                    </p>
                </div>
                <button
                    onClick={() => setShowForm(s => !s)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition-colors"
                >
                    <span>{showForm ? '✕ Đóng' : '+ Thêm ví dụ mới'}</span>
                </button>
            </div>

            {/* Hướng dẫn */}
            <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 text-sm text-violet-800 space-y-1">
                <p className="font-semibold">📌 Cách dạy AI:</p>
                <ol className="list-decimal list-inside space-y-1 text-violet-700">
                    <li>Copy đoạn text Zalo gốc bị AI parse sai vào <strong>Input text</strong></li>
                    <li>Viết kết quả đúng vào <strong>JSON mong muốn</strong> (format giống AI trả về)</li>
                    <li>Lưu lại — AI sẽ học từ ví dụ này trong lần phân tích tiếp theo</li>
                </ol>
                <p className="text-xs text-violet-500 mt-2">💡 Tối đa 10 ví dụ active. Nên chọn các trường hợp đặc thù của nhà máy.</p>
            </div>

            {/* Add form */}
            {showForm && (
                <div className="bg-card border rounded-xl p-5 space-y-4 shadow-sm">
                    <h3 className="font-semibold text-sm">Thêm ví dụ huấn luyện mới</h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">Tiêu đề ví dụ *</label>
                            <input
                                value={formTitle}
                                onChange={e => setFormTitle(e.target.value)}
                                placeholder="VD: Châu MC Peeling Ca 2"
                                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">Bộ phận liên quan (gợi ý)</label>
                            <input
                                value={formDept}
                                onChange={e => setFormDept(e.target.value)}
                                placeholder="VD: PEEL, STEAM, HPEEL..."
                                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                            />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">📝 Input text (đoạn Zalo bị sai) *</label>
                        <textarea
                            value={formInput}
                            onChange={e => setFormInput(e.target.value)}
                            rows={6}
                            placeholder={`VD:\nChâu MC Peeling\nDate: 26/03/2026\nKhu vực : Peeling mc\nCa: 2\nChính thức hiện diện: 8\nChính thức vắng: 1\nOT:`}
                            className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-400 resize-y"
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">✅ JSON kết quả đúng *</label>
                        <textarea
                            value={formJson}
                            onChange={e => setFormJson(e.target.value)}
                            rows={5}
                            placeholder={`[{"senderHint":"Châu MC Peeling","date":"2026-03-26","area":"PEEL","shift":"2","officialPresent":8,"officialAbsent":1,"seasonalPresent":0,"seasonalAbsent":0,"ot":"","vegetarian":null}]`}
                            className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-400 resize-y"
                        />
                        <p className="text-xs text-muted-foreground">Format: JSON array – giống kết quả AI trả về khi đúng</p>
                    </div>

                    {formErr && (
                        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formErr}</div>
                    )}

                    <div className="flex gap-2">
                        <button
                            onClick={handleSubmit}
                            disabled={saving}
                            className="px-5 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold disabled:opacity-50"
                        >
                            {saving ? 'Đang lưu...' : '💾 Lưu ví dụ'}
                        </button>
                        <button
                            onClick={() => { setShowForm(false); setFormErr(null) }}
                            className="px-4 py-2 rounded-lg border text-sm"
                        >Hủy</button>
                    </div>
                </div>
            )}

            {/* Examples list */}
            {loading ? (
                <div className="text-center py-10 text-muted-foreground">Đang tải...</div>
            ) : examples.length === 0 ? (
                <div className="bg-muted/30 rounded-xl border p-10 text-center text-muted-foreground">
                    <p className="text-3xl mb-3">🧠</p>
                    <p className="font-medium">Chưa có ví dụ nào</p>
                    <p className="text-sm mt-1">Bấm &quot;+ Thêm ví dụ mới&quot; để bắt đầu dạy AI</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {examples.map(ex => (
                        <div key={ex.id} className={`rounded-xl border shadow-sm overflow-hidden transition-all ${ex.is_active ? 'border-violet-200 bg-violet-50/30' : 'border-muted bg-muted/20 opacity-60'}`}>
                            {/* Row header */}
                            <div className="flex items-center gap-3 px-4 py-3">
                                {/* Active toggle */}
                                <button
                                    onClick={() => handleToggleActive(ex)}
                                    title={ex.is_active ? 'Đang dùng — bấm để tắt' : 'Đang tắt — bấm để bật'}
                                    className={`flex-shrink-0 w-10 h-5 rounded-full transition-colors relative ${ex.is_active ? 'bg-violet-500' : 'bg-muted-foreground/30'}`}
                                >
                                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${ex.is_active ? 'left-5' : 'left-0.5'}`} />
                                </button>

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-semibold text-sm">{ex.title}</span>
                                        {ex.dept_hint && (
                                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-mono">{ex.dept_hint}</span>
                                        )}
                                        {ex.is_active ? (
                                            <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-semibold">✓ Đang dùng</span>
                                        ) : (
                                            <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">Tắt</span>
                                        )}
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        {new Date(ex.created_at).toLocaleDateString('vi-VN')}
                                    </p>
                                </div>

                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <button
                                        onClick={() => setExpandedId(expandedId === ex.id ? null : ex.id)}
                                        className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border hover:bg-muted transition-colors"
                                    >
                                        {expandedId === ex.id ? '▲ Thu gọn' : '▼ Xem chi tiết'}
                                    </button>
                                    <button
                                        onClick={() => handleDelete(ex.id)}
                                        className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded hover:bg-red-200 transition-colors"
                                    >🗑</button>
                                </div>
                            </div>

                            {/* Expanded detail */}
                            {expandedId === ex.id && (
                                <div className="border-t bg-white px-4 py-4 space-y-3">
                                    <div>
                                        <p className="text-xs font-semibold text-muted-foreground mb-1">📝 INPUT TEXT:</p>
                                        <pre className="text-xs bg-muted/30 rounded-lg p-3 whitespace-pre-wrap font-mono border">{ex.input_text}</pre>
                                    </div>
                                    <div>
                                        <p className="text-xs font-semibold text-muted-foreground mb-1">✅ EXPECTED JSON:</p>
                                        <pre className="text-xs bg-green-50 rounded-lg p-3 whitespace-pre-wrap font-mono border border-green-100 text-green-800 overflow-x-auto">
                                            {JSON.stringify(ex.expected_json, null, 2)}
                                        </pre>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {activeCount >= 10 && (
                <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                    ⚠️ Đã có {activeCount} ví dụ active. AI sẽ dùng tối đa 10 ví dụ. Tắt bớt những ví dụ không cần thiết.
                </div>
            )}
        </div>
    )
}
