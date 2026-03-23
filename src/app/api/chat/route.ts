import { google } from '@ai-sdk/google';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { ddsClient } from '@/lib/supabase/dds-client';
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
- Whenever a user asks for metrics like Yield, KPIs, production, electricity, water, downtime, or output for a specific date, week, or month, you MUST use the provided tools to query the database first before answering.
- If the user doesn't specify a date, assume they want data for "today" or the latest available data.
- If the user asks for a whole month (e.g. "tháng 3"), use the first day (e.g. 2026-03-01) and last day (2026-03-31) of that month as the date range.
- The factory departments include STEAM (Steaming), SHELL (Shelling), BORMA, PEEL_MC (Peeling Machine), CS (Color Sorter), HAND (Hand Peeling), and PACK (Packing).
- When asked "why" a machine stopped or details about downtime incidents, use the get_downtime_issues tool to list the specific reasons.
- When you receive data from the tools, analyze it briefly (e.g. sum up the 'actual_ton', compare to 'plan_ton') and give a helpful and natural response in the same language the user asked in (usually Vietnamese or English).
- Do not make up any data. If the tool returns empty or null, inform the user that data is not yet inputted for that period.
- Today's date is: ${format(new Date(), 'yyyy-MM-dd')}`;

    const result = await streamText({
      model: google('gemini-1.5-flash'),
      system: systemPrompt,
      messages,
      maxToolRoundtrips: 5, // Allows the model to call multiple tools automatically
      tools: {
        get_daily_factory_kpi: tool({
          description: 'Get the total overall factory key performance indicators (KPIs) like total actual production (tons), total plan, total ISP (Finished Goods), and total downtime. Provide a date range.',
          parameters: z.object({
            start_date: z.string().describe('The start date to query in YYYY-MM-DD format.'),
            end_date: z.string().describe('The end date to query in YYYY-MM-DD format.'),
          }),
          execute: async ({ start_date, end_date }) => {
            const { data, error } = await supabase
              .from('v_dashboard_total_daily')
              .select('work_date, total_plan_ton, total_actual_ton, total_plan_isp_ton, total_actual_isp_ton, total_plan_container, total_actual_container, total_downtime_min')
              .gte('work_date', start_date)
              .lte('work_date', end_date)
              .order('work_date');
            if (error || !data || data.length === 0) return { status: 'no_data', message: `No total factory KPI found between ${start_date} and ${end_date}` };
            return { results: data };
          },
        }),
        get_department_kpi: tool({
          description: 'Get the KPI metrics for a specific department (like STEAM, SHELL, PACK). Provide a date range.',
          parameters: z.object({
            dept_code: z.string().describe('The department code, must be one of: STEAM, SHELL, BORMA, PEEL_MC, CS, HAND, PACK.'),
            start_date: z.string().describe('The start date to query in YYYY-MM-DD format.'),
            end_date: z.string().describe('The end date to query in YYYY-MM-DD format.'),
          }),
          execute: async ({ dept_code, start_date, end_date }) => {
            const { data, error } = await supabase
              .from('v_dashboard_daily')
              .select('work_date, plan_ton, actual_ton, plan_container, actual_container, input_ton, good_output_ton, electricity_consumption_kwh, downtime_min')
              .eq('dept_code', dept_code)
              .gte('work_date', start_date)
              .lte('work_date', end_date)
              .order('work_date');
            if (error || !data || data.length === 0) return { status: 'no_data', message: `No KPI found for department ${dept_code} between ${start_date} and ${end_date}` };
            return { results: data };
          },
        }),
        get_energy_consumption: tool({
          description: 'Get the factory energy consumption (electricity, water, wood) and their targets. Provide a date range.',
          parameters: z.object({
            start_date: z.string().describe('The start date to query in YYYY-MM-DD format.'),
            end_date: z.string().describe('The end date to query in YYYY-MM-DD format.'),
          }),
          execute: async ({ start_date, end_date }) => {
            const { data, error } = await supabase
              .from('daily_energy')
              .select('work_date, electricity_kwh, electricity_target_kwh, water_m3, water_target_m3, wood_kg, wood_target_kg')
              .gte('work_date', start_date)
              .lte('work_date', end_date)
              .order('work_date');
            if (error || !data || data.length === 0) return { status: 'no_data', message: `No energy history found between ${start_date} and ${end_date}` };
            return { results: data };
          },
        }),
        get_shelling_lines_detail: tool({
          description: 'Get detailed machine-level performance for the Shelling department (Lines A, B, C, D1, D2) over a given date range. This includes run hours, manpower, broken percentage, and actual production.',
          parameters: z.object({
            start_date: z.string().describe('The start date to query in YYYY-MM-DD format.'),
            end_date: z.string().describe('The end date to query in YYYY-MM-DD format.'),
          }),
          execute: async ({ start_date, end_date }) => {
            const { data, error } = await supabase
              .from('shelling_line_daily')
              .select('work_date, line_code, shift_name, actual_ton, run_hours, downtime_min, manpower, broken_pct, size')
              .gte('work_date', start_date)
              .lte('work_date', end_date)
              .order('work_date').order('line_code');
            if (error || !data || data.length === 0) return { status: 'no_data', message: `No shelling line data found between ${start_date} and ${end_date}` };
            return { results: data };
          },
        }),
        get_downtime_issues: tool({
          description: 'Get explicit reasons and detailed incident descriptions for factory stops/downtime from the DDS tracker over a date range. Explains WHY a machine stopped.',
          parameters: z.object({
            start_date: z.string().describe('The start date to query in YYYY-MM-DD format.'),
            end_date: z.string().describe('The end date to query in YYYY-MM-DD format.'),
          }),
          execute: async ({ start_date, end_date }) => {
            const { data, error } = await ddsClient
              .from('issues')
              .select('*')
              .eq('is_downtime', true)
              .gte('start_time', `${start_date}T00:00:00Z`)
              .lte('start_time', `${end_date}T23:59:59Z`);
            if (error || !data || data.length === 0) return { status: 'no_data', message: `No downtime issues recorded between ${start_date} and ${end_date}` };
            // Return only a subset of crucial columns to avoid token bloat
            return {
              results: data.map((issue: any) => ({
                department: issue.department,
                start_time: issue.start_time,
                duration_mins: issue.duration_mins,
                title: issue.title || issue.issue_description || issue.name || 'No description provided',
                status: issue.status
              }))
            };
          },
        }),
      }
    });

    return result.toDataStreamResponse();
  } catch (error) {
    console.error('Chat API Error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}
