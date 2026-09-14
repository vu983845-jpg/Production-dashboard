"use client"

import { useEffect, useState } from "react"
import { format } from "date-fns"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { BoilerProcessMix } from "./types"

type Basis = 'unknown' | 'rcn-equivalent' | 'kernel-mass'
type Form = Pick<BoilerProcessMix, 'self_steamed_rcn_kg' | 'received_precut_rcn_kg' | 'received_precut_basis' | 'borma_input_kg' | 'borma_input_basis' | 'borma_runtime_hours' | 'moisture_in_pct' | 'moisture_out_pct' | 'data_quality_status' | 'notes'>
type Props = { currentMonth: Date; mix: BoilerProcessMix | null; onSaved: () => void }
const empty: Form = { self_steamed_rcn_kg: null, received_precut_rcn_kg: null, received_precut_basis: 'unknown', borma_input_kg: null, borma_input_basis: 'unknown', borma_runtime_hours: null, moisture_in_pct: null, moisture_out_pct: null, data_quality_status: 'draft', notes: null }
const quantities: { key: keyof Pick<Form, 'self_steamed_rcn_kg' | 'received_precut_rcn_kg' | 'borma_input_kg' | 'borma_runtime_hours' | 'moisture_in_pct' | 'moisture_out_pct'>; label: string; hint: string }[] = [
  { key: 'self_steamed_rcn_kg', label: 'RCN self-steamed (kg)', hint: 'Actual internal steaming quantity.' },
  { key: 'received_precut_rcn_kg', label: 'Pre-cut receipt (kg)', hint: 'Receipt is independent of actual Borma input.' },
  { key: 'borma_input_kg', label: 'Actual Borma input (kg)', hint: 'Do not infer this value from receipt.' },
  { key: 'borma_runtime_hours', label: 'Borma runtime (hours)', hint: 'Optional.' },
  { key: 'moisture_in_pct', label: 'Moisture in (%)', hint: 'Optional.' },
  { key: 'moisture_out_pct', label: 'Moisture out (%)', hint: 'Optional.' },
]
function BasisSelect({ value, onChange }: { value: Basis; onChange: (value: Basis) => void }) { return <select aria-label="Measurement basis" value={value} onChange={event => onChange(event.target.value as Basis)} className="mt-1 w-full rounded border p-2 text-sm"><option value="unknown">Basis unknown</option><option value="rcn-equivalent">RCN equivalent</option><option value="kernel-mass">Actual kernel mass</option></select> }
export function TabBoilerMix({ currentMonth, mix, onSaved }: Props) {
  const [form, setForm] = useState<Form>(empty); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null)
  useEffect(() => { setForm(mix ? { ...empty, self_steamed_rcn_kg: mix.self_steamed_rcn_kg, received_precut_rcn_kg: mix.received_precut_rcn_kg, received_precut_basis: mix.received_precut_basis ?? 'unknown', borma_input_kg: mix.borma_input_kg, borma_input_basis: mix.borma_input_basis ?? 'unknown', borma_runtime_hours: mix.borma_runtime_hours, moisture_in_pct: mix.moisture_in_pct, moisture_out_pct: mix.moisture_out_pct, data_quality_status: mix.data_quality_status, notes: mix.notes ?? null } : empty) }, [mix])
  const setNumber = (key: keyof Form, value: string) => setForm(previous => ({ ...previous, [key]: value === '' ? null : Number(value) }))
  async function save() { setSaving(true); setError(null); try { const response = await fetch('/api/iso50001/boiler-mix', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, month_year: format(currentMonth, 'yyyy-MM-01') }) }); const json = await response.json(); if (!response.ok) throw new Error(json.error ?? 'Unable to save mix tracking'); onSaved() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save mix tracking') } finally { setSaving(false) } }
  return <Card><CardHeader><CardTitle>Steaming & Borma mix</CardTitle><CardDescription>The boiler serves both steaming and Borma. Leave an unmeasured input blank; enter 0 only for a confirmed zero. Receipt and Borma input are separate measurements.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid gap-4 md:grid-cols-2">{quantities.map(field => <label key={field.key} className="space-y-1 text-sm font-medium">{field.label}<input type="number" min="0" step="any" value={form[field.key] ?? ''} onChange={event => setNumber(field.key, event.target.value)} className="w-full rounded border px-3 py-2 font-normal"/><span className="block text-xs font-normal text-muted-foreground">{field.hint}</span>{field.key === 'received_precut_rcn_kg' && <BasisSelect value={form.received_precut_basis} onChange={received_precut_basis => setForm(previous => ({ ...previous, received_precut_basis }))}/>} {field.key === 'borma_input_kg' && <BasisSelect value={form.borma_input_basis} onChange={borma_input_basis => setForm(previous => ({ ...previous, borma_input_basis }))}/>}</label>)}</div><label className="block text-sm font-medium">Data quality<select value={form.data_quality_status} onChange={event => setForm(previous => ({ ...previous, data_quality_status: event.target.value as Form['data_quality_status'] }))} className="ml-2 rounded border p-2 font-normal"><option value="draft">Draft</option><option value="estimated">Estimated</option><option value="verified">Verified</option></select></label><label className="block text-sm font-medium">Notes / evidence source<textarea value={form.notes ?? ''} onChange={event => setForm(previous => ({ ...previous, notes: event.target.value || null }))} className="mt-1 w-full rounded border p-2 font-normal" rows={3}/></label>{error && <p className="text-sm text-red-600">{error}</p>}<Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save monthly mix'}</Button></CardContent></Card>
}
