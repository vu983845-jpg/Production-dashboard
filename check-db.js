require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
    const today = new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" });
    const todayStr = new Date(today).toISOString().split('T')[0];
    
    const { data, error } = await supabase
        .from("meal_headcount")
        .select("id, department_name, shift, official_present, seasonal_present, created_at, updated_at")
        .eq("work_date", "2026-05-22")
        .order("created_at", { ascending: false });
        
    if (error) console.error(error);
    else console.log(data.filter(d => d.department_name.includes("Peel") || d.department_name.includes("Grading")));
}

check();
