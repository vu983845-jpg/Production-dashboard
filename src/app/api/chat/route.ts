import Groq from 'groq-sdk';
import { createClient } from '@/lib/supabase/server';
import { ddsClient } from '@/lib/supabase/dds-client';
import { format } from 'date-fns';

export const maxDuration = 30;

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const tools: Groq.Chat.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_daily_factory_kpi',
      description: 'Get total factory KPIs (tons actual/plan, ISP, downtime) for a date range.',
      parameters: {
        type: 'object',
        properties: {
          start_date: { type: 'string', description: 'Start date YYYY-MM-DD' },
          end_date: { type: 'string', description: 'End date YYYY-MM-DD' },
        },
        required: ['start_date', 'end_date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_department_kpi',
      description: 'Get KPI for a specific department (STEAM, SHELL, BORMA, PEEL_MC, CS, HAND, PACK) for a date range.',
      parameters: {
        type: 'object',
        properties: {
          dept_code: { type: 'string', description: 'One of: STEAM, SHELL, BORMA, PEEL_MC, CS, HAND, PACK.' },
          start_date: { type: 'string', description: 'Start date YYYY-MM-DD' },
          end_date: { type: 'string', description: 'End date YYYY-MM-DD' },
        },
        required: ['dept_code', 'start_date', 'end_date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_energy_consumption',
      description: 'Get factory energy (electricity kWh, water m3, wood kg) and targets for a date range.',
      parameters: {
        type: 'object',
        properties: {
          start_date: { type: 'string', description: 'Start date YYYY-MM-DD' },
          end_date: { type: 'string', description: 'End date YYYY-MM-DD' },
        },
        required: ['start_date', 'end_date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_shelling_lines_detail',
      description: 'Get per-machine shelling data (Lines A,B,C,D1,D2): tons, run hours, manpower, broken% for a date range.',
      parameters: {
        type: 'object',
        properties: {
          start_date: { type: 'string', description: 'Start date YYYY-MM-DD' },
          end_date: { type: 'string', description: 'End date YYYY-MM-DD' },
        },
        required: ['start_date', 'end_date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_downtime_issues',
      description: 'Get downtime incident descriptions/reasons from the DDS tracker. Use to explain WHY machines stopped.',
      parameters: {
        type: 'object',
        properties: {
          start_date: { type: 'string', description: 'Start date YYYY-MM-DD' },
          end_date: { type: 'string', description: 'End date YYYY-MM-DD' },
        },
        required: ['start_date', 'end_date'],
      },
    },
  },
];

async function executeTool(name: string, args: Record<string, string>, supabase: Awaited<ReturnType<typeof createClient>>) {
  const { start_date, end_date, dept_code } = args;

  if (name === 'get_daily_factory_kpi') {
    const { data } = await supabase.from('v_dashboard_total_daily')
      .select('work_date, total_plan_ton, total_actual_ton, total_plan_isp_ton, total_actual_isp_ton, total_downtime_min')
      .gte('work_date', start_date).lte('work_date', end_date).order('work_date');
    return data?.length ? { results: data } : { status: 'no_data', message: 'No factory KPI found.' };
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
    return data?.length ? { results: data } : { status: 'no_data', message: 'No shelling line data.' };
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

    const systemPrompt = `You are a helpful AI assistant for a Cashew factory production dashboard.
You have tools to fetch real data from the factory database.
RULES:
- Always call a tool when the user asks about production (tons), KPIs, electricity, water, downtime, or shelling line performance.
- If no date is given, use today: ${format(new Date(), 'yyyy-MM-dd')}.
- For a whole month (e.g. "tháng 3 2026"), use first day (2026-03-01) to last day (2026-03-31).
- Departments: STEAM, SHELL, BORMA, PEEL_MC, CS, HAND, PACK.
- Analyze data you receive from tools and summarize key insights.
- Reply in the SAME language as the user (Vietnamese or English).
- Never invent data. If the tool returns no_data, tell the user clearly.`;

    const groqMessages: Groq.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ];

    // Agentic loop — call tools up to 5 rounds
    for (let round = 0; round < 5; round++) {
      const completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: groqMessages,
        tools,
        tool_choice: 'auto',
        temperature: 0.3,
        max_tokens: 2048,
      });

      const choice = completion.choices[0];
      const message = choice.message;

      // No more tool calls → done
      if (!message.tool_calls || message.tool_calls.length === 0) {
        return new Response(
          JSON.stringify({ role: 'assistant', content: message.content || '' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Push assistant message with tool calls
      groqMessages.push(message);

      // Execute each tool call and push results
      for (const call of message.tool_calls) {
        const args = JSON.parse(call.function.arguments);
        const result = await executeTool(call.function.name, args, supabase);
        groqMessages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
    }

    // Fallback if somehow we didn't get a response 
    return new Response(
      JSON.stringify({ role: 'assistant', content: 'Xin lỗi, tôi không thể xử lý yêu cầu này. Vui lòng thử lại.' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const e = error as Error;
    const msg = e?.message ?? '';
    if (msg.includes('429') || msg.includes('quota') || msg.includes('rate_limit')) {
      return new Response(
        JSON.stringify({ role: 'assistant', content: 'Đang bận, vui lòng chờ 1 phút rồi thử lại.' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    console.error('Chat API Error:', msg);
    return new Response(
      JSON.stringify({ role: 'assistant', content: `Lỗi hệ thống: ${msg.slice(0, 100)}` }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
