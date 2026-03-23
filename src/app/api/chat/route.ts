import { GoogleGenerativeAI, type FunctionDeclaration, SchemaType } from '@google/generative-ai';
import { createClient } from '@/lib/supabase/server';
import { ddsClient } from '@/lib/supabase/dds-client';
import { format } from 'date-fns';

export const maxDuration = 30;

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!);

const tools: FunctionDeclaration[] = [
  {
    name: 'get_daily_factory_kpi',
    description: 'Get total factory KPIs (tons actual/plan, ISP, downtime) for a date range.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        start_date: { type: SchemaType.STRING, description: 'Start date YYYY-MM-DD' },
        end_date: { type: SchemaType.STRING, description: 'End date YYYY-MM-DD' },
      },
      required: ['start_date', 'end_date'],
    },
  },
  {
    name: 'get_department_kpi',
    description: 'Get KPI for a specific department (STEAM, SHELL, BORMA, PEEL_MC, CS, HAND, PACK) for a date range.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        dept_code: { type: SchemaType.STRING, description: 'One of: STEAM, SHELL, BORMA, PEEL_MC, CS, HAND, PACK.' },
        start_date: { type: SchemaType.STRING, description: 'Start date YYYY-MM-DD' },
        end_date: { type: SchemaType.STRING, description: 'End date YYYY-MM-DD' },
      },
      required: ['dept_code', 'start_date', 'end_date'],
    },
  },
  {
    name: 'get_energy_consumption',
    description: 'Get factory energy (electricity kWh, water m3, wood kg) and targets for a date range.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        start_date: { type: SchemaType.STRING, description: 'Start date YYYY-MM-DD' },
        end_date: { type: SchemaType.STRING, description: 'End date YYYY-MM-DD' },
      },
      required: ['start_date', 'end_date'],
    },
  },
  {
    name: 'get_shelling_lines_detail',
    description: 'Get per-machine shelling data (Lines A,B,C,D1,D2): tons, run hours, manpower, broken% for a date range.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        start_date: { type: SchemaType.STRING, description: 'Start date YYYY-MM-DD' },
        end_date: { type: SchemaType.STRING, description: 'End date YYYY-MM-DD' },
      },
      required: ['start_date', 'end_date'],
    },
  },
  {
    name: 'get_downtime_issues',
    description: 'Get downtime incident descriptions/reasons from the DDS tracker. Use to explain WHY machines stopped.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        start_date: { type: SchemaType.STRING, description: 'Start date YYYY-MM-DD' },
        end_date: { type: SchemaType.STRING, description: 'End date YYYY-MM-DD' },
      },
      required: ['start_date', 'end_date'],
    },
  },
];

async function executeTool(name: string, args: Record<string, string>, supabase: Awaited<ReturnType<typeof createClient>>) {
  const { start_date, end_date, dept_code } = args;

  if (name === 'get_daily_factory_kpi') {
    const { data } = await supabase.from('v_dashboard_total_daily')
      .select('work_date, total_plan_ton, total_actual_ton, total_plan_isp_ton, total_actual_isp_ton, total_downtime_min')
      .gte('work_date', start_date).lte('work_date', end_date).order('work_date');
    return data?.length ? { results: data } : { status: 'no_data', message: 'No factory KPI found for this period.' };
  }

  if (name === 'get_department_kpi') {
    const { data } = await supabase.from('v_dashboard_daily')
      .select('work_date, plan_ton, actual_ton, input_ton, good_output_ton, electricity_consumption_kwh, downtime_min')
      .eq('dept_code', dept_code).gte('work_date', start_date).lte('work_date', end_date).order('work_date');
    return data?.length ? { results: data } : { status: 'no_data', message: `No KPI for ${dept_code}.` };
  }

  if (name === 'get_energy_consumption') {
    const { data } = await supabase.from('daily_energy')
      .select('work_date, electricity_kwh, electricity_target_kwh, water_m3, water_target_m3, wood_kg, wood_target_kg')
      .gte('work_date', start_date).lte('work_date', end_date).order('work_date');
    return data?.length ? { results: data } : { status: 'no_data', message: 'No energy data. The daily_energy table may be empty.' };
  }

  if (name === 'get_shelling_lines_detail') {
    const { data } = await supabase.from('shelling_line_daily')
      .select('work_date, line_code, shift_name, actual_ton, run_hours, downtime_min, manpower, broken_pct')
      .gte('work_date', start_date).lte('work_date', end_date).order('work_date').order('line_code');
    return data?.length ? { results: data } : { status: 'no_data', message: 'No shelling line data found.' };
  }

  if (name === 'get_downtime_issues') {
    const { data } = await ddsClient.from('issues').select('*').eq('is_downtime', true)
      .gte('start_time', `${start_date}T00:00:00Z`).lte('start_time', `${end_date}T23:59:59Z`);
    if (!data?.length) return { status: 'no_data', message: 'No downtime incidents recorded.' };
    return {
      results: data.map((i: Record<string, unknown>) => ({
        department: i.department,
        start_time: i.start_time,
        duration_mins: i.duration_mins,
        title: i.title || i.issue_description || i.name || 'No description provided',
        status: i.status,
      }))
    };
  }

  return { error: 'Unknown tool' };
}

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    const supabase = await createClient();

    const systemInstruction = `You are a helpful AI assistant for a Cashew factory dashboard.
You have tools to fetch real data from the factory database.
RULES:
- Always use tools when users ask about production (tons), KPIs, electricity, water, downtime, or shelling line performance.
- If no date is given, use today: ${format(new Date(), 'yyyy-MM-dd')}.
- For a whole month (e.g. "tháng 3"), use first day (e.g. 2026-03-01) to last day (2026-03-31).
- Departments: STEAM, SHELL, BORMA, PEEL_MC, CS, HAND, PACK.
- Analyze data and reply in the same language as the user (Vietnamese or English).
- If no data found, say so clearly. Never invent data.`;

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      systemInstruction,
      tools: [{ functionDeclarations: tools }],
    });

    // Convert messages to Gemini format
    const history = messages.slice(0, -1).map((m: { role: string; content: string }) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }],
    }));

    const lastMessage = messages[messages.length - 1];
    const chat = model.startChat({ history });

    let result = await chat.sendMessage(lastMessage.content);
    let response = result.response;

    // Handle tool calls (up to 5 rounds)
    for (let round = 0; round < 5; round++) {
      const functionCalls = response.functionCalls();
      if (!functionCalls || functionCalls.length === 0) break;

      const functionResults = await Promise.all(
        functionCalls.map(async (call) => {
          const toolResult = await executeTool(call.name, call.args as Record<string, string>, supabase);
          return {
            functionResponse: {
              name: call.name,
              response: toolResult,
            }
          };
        })
      );

      result = await chat.sendMessage(functionResults);
      response = result.response;
    }

    const text = response.text();

    return new Response(JSON.stringify({ role: 'assistant', content: text }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const e = error as Error;
    if (e?.message?.includes('429') || e?.message?.includes('quota')) {
      return new Response(JSON.stringify({ role: 'assistant', content: 'Cập nhật quá nhanh, vui lòng chờ 1 phút rồi thử lại.' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    console.error('Chat API Error:', e.message);
    return new Response(JSON.stringify({ role: 'assistant', content: `Lỗi hệ thống: ${e.message}` }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
