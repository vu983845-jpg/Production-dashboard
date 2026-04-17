const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
    'https://iekjajbmbkqrbalnjwit.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlla2phamJtYmtxcmJhbG5qd2l0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjYwNzEwMiwiZXhwIjoyMDg4MTgzMTAyfQ.XZaEyZGWgEB3PheVg559X-kyyIfARl-KAo83Wzeclg8'
);
async function run() {
    const hpeelId = '321918c2-8a35-45b3-9c6c-5f68966776bf'; // HPEEL
    const { error } = await supabase.from('departments').update({ name_en: 'MANUAL GRADING' }).eq('id', hpeelId);
    console.log('Rename HPEEL result:', error ?? 'Success → MANUAL GRADING');
}
run();
