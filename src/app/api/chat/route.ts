import { google } from '@ai-sdk/google';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { format } from 'date-fns';

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    const supabase = await createClient();

    // The system prompt explicitly tells the AI to use its tools when a user asks about data.
    const systemPrompt = `You are a helpful AI assistant integrated into a Cashew factory dashboard system.
You have tools to fetch real data from the factory's Supabase database.
IMPORTANT INSTRUCTIONS:
- Whenever a user asks for metrics like Yield, KPIs, production, electricity, water, downtime, or output for today, yesterday, or a specific date, you MUST use the provided tools to query the database first before answering.
- If the user doesn't specify a date, assume they want data for "today" or the latest available data.
- The factory departments include STEAM (Steaming), SHELL (Shelling), BORMA, PEEL_MC (Peeling Machine), CS (Color Sorter), HAND (Hand Peeling), and PACK (Packing).
- When you receive data from the tools, analyze it briefly (e.g. check "plan_ton" vs "actual_ton" and calculate achievement percentage) and give a helpful and natural response in the same language the user asked in (usually Vietnamese or English).
- Do not make up any data. If the tool returns empty or null, inform the user that data is not yet inputted for that day.
- Today's date is: ${format(new Date(), 'yyyy-MM-dd')}`;

    const result = await streamText({
      model: google('gemini-2.5-flash'),
      system: systemPrompt,
      messages,
      maxToolRoundtrips: 5, // Allows the model to call multiple tools automatically
      tools: {
        get_daily_factory_kpi: tool({
          description: 'Get the total overall factory key performance indicators (KPIs) like total actual production (tons), total plan, total ISP (Finished Goods), and total downtime for a specific date.',
          parameters: z.object({
            work_date: z.string().describe('The date to query in YYYY-MM-DD format.'),
          }),
          execute: async ({ work_date }) => {
            const { data, error } = await supabase
              .from('v_dashboard_total_daily')
              .select('*')
              .eq('work_date', work_date)
              .single();
            if (error || !data) return { status: 'no_data', message: `No total factory KPI found for ${work_date}` };
            return {
              work_date: data.work_date,
              total_plan_ton: data.total_plan_ton,
              total_actual_ton: data.total_actual_ton,
              total_plan_isp_ton: data.total_plan_isp_ton,
              total_actual_isp_ton: data.total_actual_isp_ton,
              total_plan_container: data.total_plan_container,
              total_actual_container: data.total_actual_container,
              total_downtime_min: data.total_downtime_min
            };
          },
        }),
        get_department_kpi: tool({
          description: 'Get the daily KPI metrics for a specific department (like STEAM, SHELL, PACK) for a specific date.',
          parameters: z.object({
            dept_code: z.string().describe('The department code, must be one of: STEAM, SHELL, BORMA, PEEL_MC, CS, HAND, PACK.'),
            work_date: z.string().describe('The date to query in YYYY-MM-DD format.'),
          }),
          execute: async ({ dept_code, work_date }) => {
            const { data, error } = await supabase
              .from('v_dashboard_daily')
              .select('*')
              .eq('work_date', work_date)
              .eq('dept_code', dept_code)
              .single();
            if (error || !data) return { status: 'no_data', message: `No KPI found for department ${dept_code} on ${work_date}` };
            return {
              department: data.dept_name_en,
              dept_code,
              work_date: data.work_date,
              plan_ton: data.plan_ton,
              actual_ton: data.actual_ton,
              plan_container: data.plan_container,
              actual_container: data.actual_container,
              input_ton: data.input_ton,
              good_output_ton: data.good_output_ton,
              electricity_consumption_kwh: data.electricity_consumption_kwh,
              downtime_min: data.downtime_min,
              yield_pct: (data.good_output_ton / data.input_ton) * 100 // Calculated yield
            };
          },
        }),
        get_energy_consumption: tool({
          description: 'Get the daily factory energy consumption (electricity, water, wood) and their targets for a given date.',
          parameters: z.object({
            work_date: z.string().describe('The date to query in YYYY-MM-DD format.'),
          }),
          execute: async ({ work_date }) => {
            const { data, error } = await supabase
              .from('daily_energy')
              .select('*')
              .eq('work_date', work_date)
              .single();
            if (error || !data) return { status: 'no_data', message: `No energy history found for ${work_date}` };
            return {
              work_date: data.work_date,
              electricity_kwh: data.electricity_kwh,
              electricity_target_kwh: data.electricity_target_kwh,
              water_m3: data.water_m3,
              water_target_m3: data.water_target_m3,
              wood_kg: data.wood_kg,
              wood_target_kg: data.wood_target_kg
            };
          },
        })
      }
    });

    return result.toDataStreamResponse();
  } catch (error) {
    console.error('Chat API Error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}
