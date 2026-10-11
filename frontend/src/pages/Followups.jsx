import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarCheck, CalendarClock, CalendarPlus, CalendarX, Send, X } from "lucide-react";
import PageHeader from "../components/PageHeader.jsx";
import EmptyState from "../components/EmptyState.jsx";
import Spinner from "../components/Spinner.jsx";
import StatusBadge, { OpenedBadge } from "../components/StatusBadge.jsx";
import FollowupModal from "../components/FollowupModal.jsx";
import { api } from "../lib/api.js";
import { fmtDate, fmtDateTime, fmtTime, fmtWhen, todayDhaka } from "../lib/format.js";

function FollowupChips({ lead, onDelete }) {
  if (!lead.followups.length) return <p className="text-xs text-slate-400">No follow-ups yet</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {lead.followups.map((f) => (
        <span
          key={f.id}
          title={f.sent ? `Sent ${fmtDateTime(f.sent_at)}` : "Scheduled"}
          className={`chip inline-flex items-center gap-1 ring-1 ring-inset ${
            f.sent
              ? "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-300"
              : f.id === lead.next_followup_id
              ? "bg-accent-500/10 text-accent-600 ring-accent-500/30 dark:text-accent-300"
              : "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-ink-850 dark:text-slate-300 dark:ring-ink-700"
          }`}
        >
          #{f.number} {fmtWhen(f.scheduled_date, f.scheduled_time)} {f.sent && "✓"}
          {!f.sent && (
            <button onClick={() => onDelete(lead, f)} className="-mr-1 rounded p-0.5 hover:bg-rose-500/15 hover:text-rose-500" aria-label={`Remove follow-up ${f.number}`}>
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}
    </div>
  );
}

function AddButtons({ lead, onAdd }) {
  const [custom, setCustom] = useState(false);
  const [date, setDate] = useState(todayDhaka());
  const [time, setTime] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-0.5 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
        <CalendarPlus className="h-4 w-4" /> Add follow-up:
      </span>
      <button className="chip bg-accent-500/10 text-accent-600 hover:bg-accent-500/20 dark:text-accent-300" onClick={() => onAdd(lead, { minutes: 60 })}>
        +1 hour
      </button>
      {[3, 5, 7].map((d) => (
        <button key={d} className="chip bg-accent-500/10 text-accent-600 hover:bg-accent-500/20 dark:text-accent-300" onClick={() => onAdd(lead, { days: d })}>
          +{d} days
        </button>
      ))}
      {custom ? (
        <span className="flex items-center gap-1.5">
          <input type="date" min={todayDhaka()} className="input !w-auto !py-1 !text-xs" value={date} onChange={(e) => setDate(e.target.value)} />
          <input type="time" className="input !w-auto !py-1 !text-xs" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Time (optional)" title="Time (optional, Asia/Dhaka)" />
          <button className="chip bg-accent-600 text-white" onClick={() => { onAdd(lead, { date, time: time || null }); setCustom(false); }}>Add</button>
          <button className="chip text-slate-500" onClick={() => setCustom(false)}>Cancel</button>
        </span>
      ) : (
        <button className="chip bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-ink-850 dark:text-slate-300 dark:hover:bg-ink-800" onClick={() => setCustom(true)}>
          Custom date &amp; time
        </button>
      )}
    </div>
  );
}

function statusText(lead) {
  if (lead.group === "none") return "Nothing scheduled";
  if (!lead.next_followup_date) return "Due now";
  if (lead.due) return lead.overdue_days ? `Overdue by ${lead.overdue_days}d` : "Due now";
  if (lead.group === "today") return lead.next_followup_time ? `Today at ${fmtTime(lead.next_followup_time)}` : "Today";
  return `Next: ${fmtWhen(lead.next_followup_date, lead.next_followup_time)}`;
}

function Row({ lead, onAdd, onDelete, onSend }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="flex flex-col gap-4 border-b border-slate-100 p-5 last:border-0 dark:border-ink-800 lg:flex-row lg:items-center lg:justify-between"
    >
      <div className="min-w-0 space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold">{lead.name}</p>
          <span className="text-sm text-slate-500 dark:text-slate-400">{lead.email}</span>
          <StatusBadge status={lead.status} />
          <OpenedBadge opened={lead.opened} />
        </div>
        <p className="truncate text-sm text-slate-500 dark:text-slate-400">
          “{lead.subject}” · sent {fmtDateTime(lead.sent_at)} · {lead.followups_sent} follow-up{lead.followups_sent === 1 ? "" : "s"} sent
        </p>
        <FollowupChips lead={lead} onDelete={onDelete} />
        <AddButtons lead={lead} onAdd={onAdd} />
      </div>
      <div className="flex shrink-0 flex-col items-start gap-2 lg:items-end">
        <span className={`text-xs font-semibold ${lead.due ? "text-amber-600 dark:text-amber-400" : "text-slate-500"}`}>{statusText(lead)}</span>
        <button className="btn-primary !py-2" onClick={() => onSend(lead)}>
          <Send className="h-4 w-4" /> Send follow-up #{lead.next_followup_number}
        </button>
      </div>
    </motion.div>
  );
}

const GROUPS = [
  { key: "due", title: "Due now", icon: CalendarClock, tone: "text-amber-500", badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400", empty: "Nothing due today." },
  { key: "today", title: "Later today", icon: CalendarClock, tone: "text-accent-500", badge: "bg-accent-500/10 text-accent-600 dark:text-accent-300", empty: null },
  { key: "scheduled", title: "Scheduled", icon: CalendarPlus, tone: "text-accent-500", badge: "bg-accent-500/10 text-accent-600 dark:text-accent-300", empty: "No upcoming follow-ups." },
  { key: "none", title: "No follow-up scheduled", icon: CalendarX, tone: "text-slate-400", badge: "bg-slate-100 text-slate-600 dark:bg-ink-850 dark:text-slate-400", empty: null },
];

export default function Followups({ onChange }) {
  const [data, setData] = useState(null);
  const [active, setActive] = useState(null);
  const [params, setParams] = useSearchParams();
  const todayTotal = data ? data.due_count + (data.today_count || 0) : 0;
  const tab = params.get("tab") || (data && todayTotal === 0 ? "all" : "today");
  const setTab = (t) => setParams(t === "all" ? { tab: "all" } : { tab: "today" }, { replace: true });

  const load = useCallback(() => {
    onChange?.();
    return api.followups().then(setData).catch((e) => toast.error(e.message));
  }, [onChange]);
  useEffect(() => { load(); }, [load]);

  const add = async (lead, opts) => {
    try {
      const r = await api.scheduleFollowup({ lead_id: lead.id, ...opts });
      toast.success(`Follow-up #${r.number} for ${lead.name} scheduled for ${fmtWhen(r.date, r.time)}`);
      if (r.sheet_error) toast.error(`Sheet update failed: ${r.sheet_error}`);
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const remove = async (lead, f) => {
    try {
      const r = await api.deleteFollowup(f.id);
      toast.success(`Removed follow-up #${f.number} for ${lead.name}`);
      if (r.sheet_error) toast.error(`Sheet update failed: ${r.sheet_error}`);
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const send = async (payload) => {
    try {
      const r = await api.sendFollowup(payload);
      toast.success(`Follow-up #${r.number} sent to ${r.lead.email}`);
      if (r.sheet_error) toast.error(`Sheet update failed: ${r.sheet_error}`);
      setActive(null);
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <>
      <PageHeader title="Follow-ups" subtitle={data ? `Today (Asia/Dhaka): ${fmtDate(data.today)} · leads that replied or bounced are hidden` : ""} />
      {!data ? (
        <div className="flex justify-center py-20"><Spinner className="h-8 w-8" /></div>
      ) : data.items.length === 0 ? (
        <div className="card">
          <EmptyState icon={CalendarCheck} title="You're all caught up" description="No active leads need follow-ups. Leads that replied or bounced are excluded automatically." />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 dark:border-ink-700 dark:bg-ink-900">
            {[{ k: "today", label: `Today (${todayTotal})` }, { k: "all", label: `All active (${data.items.length})` }].map(({ k, label }) => (
              <button key={k} onClick={() => setTab(k)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${tab === k ? "bg-accent-600 text-white shadow-glow" : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"}`}>
                {label}
              </button>
            ))}
          </div>
          {tab === "today" && todayTotal === 0 && (
            <div className="card">
              <EmptyState icon={CalendarCheck} title="Nothing due today" description="No follow-ups are due or overdue. Check All active to see what's scheduled next."
                action={<button className="btn-ghost" onClick={() => setTab("all")}>See all active leads</button>} />
            </div>
          )}
          {GROUPS.filter((g) => tab === "all" || g.key === "due" || g.key === "today").map((g) => {
            const items = data.items.filter((i) => i.group === g.key);
            if (!items.length && (!g.empty || tab === "today")) return null;
            return (
              <section key={g.key} className="card">
                <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4 dark:border-ink-700">
                  <g.icon className={`h-4 w-4 ${g.tone}`} />
                  <h2 className="font-semibold">{g.title}</h2>
                  <span className={`chip ${g.badge}`}>{items.length}</span>
                </div>
                {items.length ? (
                  <AnimatePresence>
                    {items.map((l) => <Row key={l.id} lead={l} onAdd={add} onDelete={remove} onSend={setActive} />)}
                  </AnimatePresence>
                ) : (
                  <p className="px-5 py-6 text-sm text-slate-500 dark:text-slate-400">{g.empty}</p>
                )}
              </section>
            );
          })}
        </div>
      )}
      <FollowupModal lead={active} onClose={() => setActive(null)} onSend={send} />
    </>
  );
}
