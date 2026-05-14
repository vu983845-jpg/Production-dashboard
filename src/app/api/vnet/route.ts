import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

// ── V-NET2.0 API proxy ──────────────────────────────────────────────────
// Logs into the WECON V-NET platform and fetches real-time tag data
// for the STEAM_LA device (5 cashew steaming cookers).
//
// API Discovery:
//   Base URL:  https://asean.v-iec.com/api
//   Login:     POST /m4/sign/login  (MODULE_ID_USER_CENTER = 4)
//   Device:    POST /m5/device/getList  (MODULE_ID_DEVICE_BASE = 5)
//   Real-time: POST /m1/device/getRealTimeData (MODULE_ID_REAL = 1)

const VNET_API = process.env.VNET_API_BASE || "https://asean.v-iec.com/api";
const USERNAME = process.env.VNET_USERNAME || "";
const PASSWORD = process.env.VNET_PASSWORD || "";
const STEAM_BOX_ID = 10009531; // STEAM_LA device

// Session cache (per cold-start; ~4 min TTL)
let cachedSid = "";
let cachedCuid = "";
let sidExpiry = 0;

function buildWcommon(sid: string, cuid: string) {
    const ts = Date.now();
    const raw = `${cuid}${sid}${ts}`;
    const sign = crypto.createHash("md5").update(raw).digest("hex");
    return JSON.stringify({
        cuid,
        pid: "1",
        sv: "1.0",
        ts,
        mt: 255,
        lan: "en",
        sid,
        sign,
        domain: "asean.v-iec.com",
    });
}

async function login(): Promise<{ sid: string; cuid: string }> {
    if (cachedSid && Date.now() < sidExpiry) {
        return { sid: cachedSid, cuid: cachedCuid };
    }

    const passwordMd5 = crypto.createHash("md5").update(PASSWORD).digest("hex");
    const wcommon = buildWcommon("", "");

    const res = await fetch(`${VNET_API}/m4/sign/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", wcommon },
        body: JSON.stringify({ account: USERNAME, password: passwordMd5 }),
    });
    const json = await res.json();

    if (json.code !== 200 || !json.result?.sid) {
        throw new Error(`V-NET login failed (code ${json.code}): ${json.msg || JSON.stringify(json)}`);
    }

    cachedSid = json.result.sid;
    cachedCuid = String(json.result.cuid || json.result.userId || json.result.accountId || "");
    sidExpiry = Date.now() + 4 * 60 * 1000;
    return { sid: cachedSid, cuid: cachedCuid };
}

async function fetchDeviceData(sid: string, cuid: string) {
    const wcommon = buildWcommon(sid, cuid);
    const res = await fetch(`${VNET_API}/m5/device/getList`, {
        method: "POST",
        headers: { "Content-Type": "application/json", wcommon },
        body: JSON.stringify({ boxId: STEAM_BOX_ID }),
    });
    return res.json();
}

// ── Demo data fallback ──────────────────────────────────────────────────
function generateDemoData() {
    const now = new Date();
    const baseTemp = 130 + Math.sin(now.getMinutes() / 10) * 15;
    const makeCooker = (
        id: string,
        label: string,
        running: boolean,
        t1Base: number,
        t2Base: number,
        steamBase: number,
        inputBase: number,
    ) => ({
        id,
        label,
        running,
        t1: running ? +(t1Base + Math.random() * 5).toFixed(1) : +(20 + Math.random() * 5).toFixed(1),
        t2: running ? +(t2Base + Math.random() * 5).toFixed(1) : +(20 + Math.random() * 3).toFixed(1),
        steamPressure: running ? +(steamBase + Math.random() * 0.5).toFixed(2) : 0,
        inputPressure: running ? +(inputBase + Math.random() * 0.3).toFixed(2) : 0,
    });

    return [
        makeCooker("A", "Cooker A", true, baseTemp, baseTemp + 7, 3.2, 0.8),
        makeCooker("B", "Cooker B", true, baseTemp + 3, baseTemp + 5, 3.1, 0.9),
        makeCooker("C", "Cooker C", false, 0, 0, 0, 0),
        makeCooker("D1", "Cooker D1", true, baseTemp - 2, baseTemp + 10, 3.4, 0.7),
        makeCooker("D2", "Cooker D2", true, baseTemp + 12, baseTemp + 17, 3.6, 1.0),
    ];
}

// ── Cooker tag map ──────────────────────────────────────────────────────
const COOKER_MAP = [
    { id: "A", label: "Cooker A", runTag: "Cooker1_Run", t1Tag: "Cooker1_T1", t2Tag: "Cooker1_T2", pressTag: "Cooker1_Press", inputPressTag: "Cooker1_InputPress" },
    { id: "B", label: "Cooker B", runTag: "CookerB_Run", t1Tag: "Cooker2_T1", t2Tag: "Cooker2_T2", pressTag: "Cooker2_Press", inputPressTag: "Cooker2_InputPress" },
    { id: "C", label: "Cooker C", runTag: "CookerC_Run", t1Tag: "Cooker3_T1", t2Tag: "Cooker3_T2", pressTag: "Cooker3_Press", inputPressTag: "Cooker3_InputPress" },
    { id: "D1", label: "Cooker D1", runTag: "CookerD1_Run", t1Tag: "Cooker4_T1", t2Tag: "Cooker4_T2", pressTag: "Cooker4_Press", inputPressTag: "Cooker4_InputPress" },
    { id: "D2", label: "Cooker D2", runTag: "CookerD2_Run", t1Tag: "Cooker5_T1", t2Tag: "Cooker5_T2", pressTag: "Cooker5_Press", inputPressTag: "Cooker5_InputPress" },
];

// GET /api/vnet — return real-time cooker data
export async function GET(req: NextRequest) {
    const useDemo = req.nextUrl.searchParams.get("demo") === "1";

    // ── Demo mode ─────────────────────────────────────────────────────────
    if (useDemo) {
        return NextResponse.json({
            ok: true,
            demo: true,
            timestamp: new Date().toISOString(),
            cookers: generateDemoData(),
        });
    }

    // ── Live mode ─────────────────────────────────────────────────────────
    try {
        const { sid, cuid } = await login();
        const devRes = await fetchDeviceData(sid, cuid);

        const tagValues: Record<string, number | boolean> = {};
        const list = devRes?.result?.list || devRes?.result?.tagList || devRes?.result || [];

        if (Array.isArray(list)) {
            list.forEach((tag: any) => {
                const name = tag.name || tag.tagName || tag.tag || "";
                const val = tag.value ?? tag.val ?? tag.numerical ?? 0;
                tagValues[name] = typeof val === "boolean" ? val : Number(val);
            });
        }

        const data = COOKER_MAP.map((c) => ({
            id: c.id,
            label: c.label,
            running: Boolean(tagValues[c.runTag]),
            t1: Number(tagValues[c.t1Tag] || 0),
            t2: Number(tagValues[c.t2Tag] || 0),
            steamPressure: Number(tagValues[c.pressTag] || 0),
            inputPressure: Number(tagValues[c.inputPressTag] || 0),
        }));

        return NextResponse.json({
            ok: true,
            demo: false,
            timestamp: new Date().toISOString(),
            cookers: data,
            raw: { tagCount: Array.isArray(list) ? list.length : 0 },
        });
    } catch (err: any) {
        console.error("V-NET proxy error:", err.message);
        // Fallback to demo data on error
        return NextResponse.json({
            ok: true,
            demo: true,
            timestamp: new Date().toISOString(),
            cookers: generateDemoData(),
            _error: err.message,
        });
    }
}
