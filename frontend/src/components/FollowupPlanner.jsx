import { CalendarClock, Plus, RotateCcw, X } from "lucide-react";
import { addDaysIso, fmtDateTime, fmtWhen, nowDhakaLocal, todayDhaka } from "../lib/format.js";

const UNITS = [
  { v: "days", label: "days later" },
  { v: "hours", label: "hours later" },
  { v: "minutes", label: "minutes later" },
  { v: "exact", label: "exact date & time" },
];

let seq = 0;
export const planItem = (fields) => ({ key: ++seq, unit: "days", value: 3, time: "", at: "", ...fields });
export const planFromDays = (days) => (days || []).map((d) => planItem({ value: d }));

export function planToPayload(plan) {
  return plan.map((p) => {
    if (p.unit === "exact") return { at: p.at };
    if (p.unit === "minutes") return { minutes: Number(p.value) };
    if (p.unit === "hours") return { minutes: Math.round(Number(p.value) * 60) };
    return { days: Number(p.value), time: p.time || null };
  });
}

export function planError(plan) {
  for (const [i, p] of plan.entries()) {
    if (p.unit === "exact") {
      if (!p.at) return `Follow-up ${i + 1}: pick a date and time`;
    } else if (p.value === "" || Number(p.value) < (p.unit === "days" ? 0 : 1)) {
      return `Follow-up ${i + 1}: enter a valid number`;
    }
  }
  return null;
}

function preview(p) {
  if (p.unit === "exact") return p.at ? fmtWhen(p.at.slice(0, 10), p.at.slice(11, 16)) : "—";
  if (p.value === "") return "—";
  if (p.unit === "days") return fmtWhen(addDaysIso(todayDhaka(), p.value), p.time);
  const ms = Number(p.value) * (p.unit === "hours" ? 3600000 : 60000);
  return `≈ ${fmtDateTime(new Date(Date.now() + ms).toISOString())}`;
}

export default function FollowupPlanner({ plan, setPlan, defaults }) {
  const update = (key, patch) => setPlan((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  const remove = (key) => setPlan((ps) => ps.filter((p) => p.key !== key));
  const add = (fields) => setPlan((ps) => {
    const lastDays = [...ps].reverse().find((p) => p.unit === "days");
    return [...ps, planItem(fields || { value: lastDays ? Number(lastDays.value) + 3 : 3 })];
  });
  const isDefault = JSON.stringify(planToPayload(plan)) === JSON.stringify(planToPayload(planFromDays(defaults)));

  return (
    <div className="mt-5 rounded-2xl border border-slate-200 p-4 dark:border-ink-700">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-accent-500" />
          <p className="font-semibold">Follow-ups for this lead</p>
          <span className="chip bg-accent-500/10 text-accent-600 dark:text-accent-300">{plan.length}</span>
          {isDefault && <span className="text-xs text-slate-400">default from Settings</span>}
        </div>
        {!isDefault && (
          <button type="button" className="chip inline-flex items-center text-slate-500 hover:text-slate-800 dark:hover:text-slate-200" onClick={() => setPlan(planFromDays(defaults))}>
            <RotateCcw className="mr-1 h-3 w-3" /> Reset to default
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Only applies to this email. Each one becomes due at its time, you get a reminder, and it's sent as a reply in the same thread. Times are Asia/Dhaka.
      </p>

      <div className="mt-3 space-y-2">
        {plan.length === 0 && <p className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-500 dark:bg-ink-850 dark:text-slate-400">No follow-ups for this lead.</p>}
        {plan.map((p, i) => (
          <div key={p.key} className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-2 dark:bg-ink-850">
            <span className="w-7 text-center text-xs font-semibold text-slate-500">#{i + 1}</span>
            {p.unit !== "exact" && (
              <input type="number" min={p.unit === "days" ? 0 : 1} max={p.unit === "minutes" ? 525600 : p.unit === "hours" ? 8760 : 365}
                className="input !w-20 !py-1.5" value={p.value} aria-label={`Follow-up ${i + 1} amount`}
                onChange={(e) => update(p.key, { value: e.target.value })} />
            )}
            <select className="input !w-auto !py-1.5" value={p.unit} aria-label={`Follow-up ${i + 1} unit`}
              onChange={(e) => update(p.key, { unit: e.target.value, at: p.at || nowDhakaLocal(60) })}>
              {UNITS.map((u) => <option key={u.v} value={u.v}>{u.label}</option>)}
            </select>
            {p.unit === "days" && (
              <input type="time" className="input !w-auto !py-1.5" value={p.time} title="Time (optional)" aria-label={`Follow-up ${i + 1} time`}
                onChange={(e) => update(p.key, { time: e.target.value })} />
            )}
            {p.unit === "exact" && (
              <input type="datetime-local" className="input !w-auto !py-1.5" value={p.at} min={nowDhakaLocal()} aria-label={`Follow-up ${i + 1} date and time`}
                onChange={(e) => update(p.key, { at: e.target.value })} />
            )}
            <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">{preview(p)}</span>
            <button type="button" onClick={() => remove(p.key)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-500/10 hover:text-rose-500" aria-label={`Remove follow-up ${i + 1}`}>
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn-ghost !py-1.5 !text-sm" onClick={() => add()}><Plus className="h-4 w-4" /> Add follow-up</button>
        <button type="button" className="chip bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-ink-850 dark:text-slate-300" onClick={() => add({ unit: "minutes", value: 5 })}>
          + in 5 min (test)
        </button>
        <button type="button" className="chip bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-ink-850 dark:text-slate-300" onClick={() => add({ unit: "exact", at: nowDhakaLocal(60) })}>
          + exact time
        </button>
      </div>
    </div>
  );
}
