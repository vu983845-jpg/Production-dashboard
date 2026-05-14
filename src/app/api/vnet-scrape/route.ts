import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// ── V-NET Real-time Data API ────────────────────────────────────────
// Reads pre-scraped data from Supabase `vnet_realtime_data` table.
// Data is populated by `vnet-dom-scraper.js` running on the local
// Windows machine every 5 minutes via Task Scheduler.
//
// Devices:
//   BORMA:  row id="borma"  (device, boxId: 10009531)
//   STEAM:  row id="steam"  (STEAM_LA, boxId: 6417916)

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "https://iekjajbmbkqrbalnjwit.supabase.co").trim();
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();

// ── Demo data generators (fallback when Supabase has no data) ───────
function generateBormaDemoData() {
    const ovens = [];
    for (let i = 1; i <= 6; i++) {
        const running = [1, 4, 5, 6].includes(i);
        const baseTemp = running ? 36 + Math.random() * 6 : 28 + Math.random() * 4;
        ovens.push({
            id: i,
            label: `BORMA ${i}`,
            running,
            tempCtr: Number((baseTemp + Math.random() * 2).toFixed(1)),
            temps: Array.from({ length: 8 }, (_, j) => ({
                tag: j < 7 ? `TI410${j + 1}-${i}` : `HI4101-${i}`,
                value: Number((baseTemp + Math.random() * 3 - 1).toFixed(1)),
            })),
            pid: running,
            lv1: running,
            sv1: running,
            lv1VL: running ? Number((Math.random() * 5).toFixed(1)) : 0,
            motors: [running, running, running && Math.random() > 0.3, running && Math.random() > 0.5],
            gdTempSV: running ? Number((80 + Math.random() * 10).toFixed(1)) : 0,
        });
    }
    return { ovens, humidity: Number((90 + Math.random() * 8).toFixed(1)) };
}

function generateSteamDemoData() {
    const baseTemp = 130 + Math.sin(Date.now() / 60000) * 15;
    return [
        { id: "A", label: "Cooker A", running: true, t1: +(baseTemp + Math.random() * 5).toFixed(1), t2: +(baseTemp + 7 + Math.random() * 5).toFixed(1), steamPressure: +(3.2 + Math.random() * 0.5).toFixed(2), inputPressure: +(0.8 + Math.random() * 0.3).toFixed(2) },
        { id: "B", label: "Cooker B", running: true, t1: +(baseTemp + 3 + Math.random() * 5).toFixed(1), t2: +(baseTemp + 5 + Math.random() * 5).toFixed(1), steamPressure: +(3.1 + Math.random() * 0.5).toFixed(2), inputPressure: +(0.9 + Math.random() * 0.3).toFixed(2) },
        { id: "C", label: "Cooker C", running: false, t1: +(20 + Math.random() * 5).toFixed(1), t2: +(20 + Math.random() * 3).toFixed(1), steamPressure: 0, inputPressure: 0 },
        { id: "D1", label: "Cooker D1", running: true, t1: +(baseTemp - 2 + Math.random() * 5).toFixed(1), t2: +(baseTemp + 10 + Math.random() * 5).toFixed(1), steamPressure: +(3.4 + Math.random() * 0.5).toFixed(2), inputPressure: +(0.7 + Math.random() * 0.3).toFixed(2) },
        { id: "D2", label: "Cooker D2", running: true, t1: +(baseTemp + 12 + Math.random() * 5).toFixed(1), t2: +(baseTemp + 17 + Math.random() * 5).toFixed(1), steamPressure: +(3.6 + Math.random() * 0.5).toFixed(2), inputPressure: +(1.0 + Math.random() * 0.3).toFixed(2) },
    ];
}

// ── API Handler ─────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
    const device = req.nextUrl.searchParams.get("device") || "borma";
    const forceDemo = req.nextUrl.searchParams.get("demo") === "1";

    if (forceDemo) {
        return NextResponse.json({
            ok: true,
            demo: true,
            device,
            timestamp: new Date().toISOString(),
            data: device === "steam"
                ? { cookers: generateSteamDemoData() }
                : generateBormaDemoData(),
        });
    }

    try {
        // Read from Supabase vnet_realtime_data table (populated by local scraper)
        const res = await fetch(
            `${SUPABASE_URL}/rest/v1/vnet_realtime_data?id=eq.${device}&select=data,demo,updated_at`,
            {
                headers: {
                    apikey: SUPABASE_KEY,
                    Authorization: `Bearer ${SUPABASE_KEY}`,
                },
                // Prevent aggressive Vercel caching 
                cache: "no-store",
            }
        );

        if (res.ok) {
            const rows = await res.json();
            if (rows?.length > 0 && rows[0].data) {
                const row = rows[0];
                const updatedAt = new Date(row.updated_at);
                const ageMinutes = (Date.now() - updatedAt.getTime()) / 60000;

                // If data is older than 15 minutes, show warning but still use it
                const stale = ageMinutes > 15;

                return NextResponse.json({
                    ok: true,
                    demo: row.demo || false,
                    device,
                    timestamp: row.updated_at,
                    stale,
                    ageMinutes: Math.round(ageMinutes),
                    data: row.data,
                    history: row.data.history || [],
                    _source: "supabase",
                });
            }
        }

        // No data in Supabase — fall back to demo
        return NextResponse.json({
            ok: true,
            demo: true,
            device,
            timestamp: new Date().toISOString(),
            _note: "Chưa có dữ liệu trong Supabase. Chạy vnet-dom-scraper.js trên máy local.",
            data: device === "steam"
                ? { cookers: generateSteamDemoData() }
                : generateBormaDemoData(),
        });
    } catch (err: any) {
        console.error(`V-NET API error (${device}):`, err.message);
        return NextResponse.json({
            ok: true,
            demo: true,
            device,
            timestamp: new Date().toISOString(),
            _error: err.message,
            data: device === "steam"
                ? { cookers: generateSteamDemoData() }
                : generateBormaDemoData(),
        });
    }
}
