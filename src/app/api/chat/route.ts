import { google } from '@ai-sdk/google';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { ddsClient } from '@/lib/supabase/dds-client';
import { format } from 'date-fns';

export const maxDuration = 30;

type DateRange = { start_date: string; end_date: string };

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    const supabase = await createClient();

    const systemPrompt = `You are a helpful AI assistant integrated into a Cashew factory dashboard system.
You have tools to fetch real data from the factory's Supabase database.
IMPORTANT INSTRUCTIONS:
- Whenever a user asks for metrics like KPIs, production (tons), electricity, water, downtime, or output for a specific date, week, or month, you MUST use the provided tools to query the database first before answering.
- If the user doesn't specify a date, assume they want data for "today" (${format(new Date(), 'yyyy-MM-dd')}) or the latest available data.
- If the user asks for a whole month (e.g. "tháng 3"), use the first day (e.g. 2026-03-01) and last day (2026-03-31) of that month as the date range.
- The factory departments include STEAM, SHELL (Shelling), BORMA, PEEL_MC (Peeling Machine), CS (Color Sorter), HAND (Hand Peeling), and PACK (Packing).
- When asked "why" a machine stopped, use the get_downtime_issues tool to list specific reasons.
- Analyze the data you receive from tools, summarize key insights, and respond naturally in Vietnamese or English depending on what the user asked in.
- Do not make up any data. If the tool returns no data, inform the user.`;

    const result = await streamText({
      model: google('gemini-1.5-flash'),
      system: systemPrompt,
      messages,
      maxToolRoundtrips: 5,
      tools: {
        get_daily_factory_kpi: tool({
          description: 'Get total factory KPIs (tons actual/plan, ISP, downtime) for a date range.',
          parameters: z.object({
            start_date: z.string().describe('Start date YYYY-MM-DD'),
            end_date: z.string().describe('End date YYYY-MM-DD'),
          }),
          execute: async ({ start_date, end_date }: DateRange) => {
            const { data, error } = await supabase
              .from('v_dashboard_total_daily')
              .select('work_date, total_plan_ton, total_actual_ton, total_plan_isp_ton, total_actual_isp_ton, total_downtime_min')
              .gte('work_date', start_date).lte('work_date', end_date).order('work_date');
            if (error || !data || data.length === 0) return { status: 'no_data', message: `No factory KPI found for ${start_date} to ${end_date}` };
            return { results: data };
          },
        }),
        get_department_kpi: tool({
          description: 'Get KPI for a specific department (STEAM, SHELL, BORMA, PEEL_MC, CS, HAND, PACK) for a date range.',
          parameters: z.object({
            dept_code: z.string().describe('One of: STEAM, SHELL, BORMA, PEEL_MC, CS, HAND, PACK.'),
            start_date: z.string().describe('Start date YYYY-MM-DD'),
            end_date: z.string().describe('End date YYYY-MM-DD'),
          }),
          execute: async ({ dept_code, start_date, end_date }: DateRange & { dept_code: string }) => {
            const { data, error } = await supabase
              .from('v_dashboard_daily')
              .select('work_date, plan_ton, actual_ton, input_ton, good_output_ton, electricity_consumption_kwh, downtime_min')
              .eq('dept_code', dept_code).gte('work_date', start_date).lte('work_date', end_date).order('work_date');
            if (error || !data || data.length === 0) return { status: 'no_data', message: `No KPI for ${dept_code}` };
            return { results: data };
          },
        }),
        get_energy_consumption: tool({
          description: 'Get factory energy (electricity kWh, water m3, wood kg) and targets for a date range.',
          parameters: z.object({
            start_date: z.string().describe('Start date YYYY-MM-DD'),
            end_date: z.string().describe('End date YYYY-MM-DD'),
          }),
          execute: async ({ start_date, end_date }: DateRange) => {
            const { data, error } = await supabase
              .from('daily_energy')
              .select('work_date, electricity_kwh, electricity_target_kwh, water_m3, water_target_m3, wood_kg, wood_target_kg')
              .gte('work_date', start_date).lte('work_date', end_date).order('work_date');
            if (error || !data || data.length === 0) return { status: 'no_data', message: 'No energy data found. The daily_energy table appears to be empty.' };
            return { results: data };
          },
        }),
        get_shelling_lines_detail: tool({
          description: 'Get per-machine shelling data (Lines A,B,C,D1,D2): tons, run hours, manpower, broken% for a date range.',
          parameters: z.object({
            start_date: z.string().describe('Start date YYYY-MM-DD'),
            end_date: z.string().describe('End date YYYY-MM-DD'),
          }),
          execute: async ({ start_date, end_date }: DateRange) => {
            const { data, error } = await supabase
              .from('shelling_line_daily')
              .select('work_date, line_code, shift_name, actual_ton, run_hours, downtime_min, manpower, broken_pct, size')
              .gte('work_date', start_date).lte('work_date', end_date).order('work_date').order('line_code');
            if (error || !data || data.length === 0) return { status: 'no_data', message: 'No shelling line data found' };
            return { results: data };
          },
        }),
        get_downtime_issues: tool({
          description: 'Get downtime incident descriptions/reasons from the DDS tracker. Use to explain WHY machines stopped.',
          parameters: z.object({
            start_date: z.string().describe('Start date YYYY-MM-DD'),
            end_date: z.string().describe('End date YYYY-MM-DD'),
          }),
          execute: async ({ start_date, end_date }: DateRange) => {
            const { data, error } = await ddsClient
              .from('issues').select('*').eq('is_downtime', true)
              .gte('start_time', `${start_date}T00:00:00Z`).lte('start_time', `${end_date}T23:59:59Z`);
            if (error || !data || data.length === 0) return { status: 'no_data', message: 'No downtime incidents recorded' };
            return {
              results: data.map((issue: Record<string, unknown>) => ({
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
  } catch (error: any) {
    if (error?.message?.includes('429') || error?.message?.includes('exceeded your current quota') || error?.message?.includes('Rate limit')) {
      return new Response('Rate limit exceeded. Cập nhật quá nhanh, vui lòng chờ 1 phút rồi thử lại.', { status: 429 });
    }
    console.error('Chat API Error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}
