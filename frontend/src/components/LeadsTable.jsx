import { motion } from "framer-motion";
import StatusBadge, { OpenedBadge } from "./StatusBadge.jsx";
import { fmtDate, fmtDateTime } from "../lib/format.js";

function FollowupSummary({ lead }) {
  if (!lead.followups_total) return <span className="text-slate-400">None</span>;
  return (
    <span className="whitespace-nowrap text-xs">
      <span className="font-semibold">{lead.followups_sent}/{lead.followups_total}</span> sent
      {lead.next_followup_date && lead.pending_followup && (
        <span className="text-slate-500 dark:text-slate-400"> · next {fmtDate(lead.next_followup_date)}</span>
      )}
    </span>
  );
}

export default function LeadsTable({ leads, compact = false, onSelectLead }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-ink-700 dark:text-slate-400">
            <th className="px-4 py-3 font-semibold">Name</th>
            <th className="px-4 py-3 font-semibold">Email</th>
            {!compact && <th className="px-4 py-3 font-semibold">Company</th>}
            <th className="px-4 py-3 font-semibold">Sent</th>
            <th className="px-4 py-3 font-semibold">Subject</th>
            <th className="px-4 py-3 font-semibold">Status</th>
            <th className="px-4 py-3 font-semibold">Opened</th>
            {!compact && <th className="px-4 py-3 font-semibold">First opened</th>}
            {!compact && <th className="px-4 py-3 font-semibold">Follow-ups</th>}
          </tr>
        </thead>
        <tbody>
          {leads.map((l, i) => (
            <motion.tr
              key={l.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: Math.min(i * 0.02, 0.3) }}
              onClick={() => onSelectLead?.(l)}
              className={`border-b border-slate-100 transition last:border-0 dark:border-ink-800 ${
                onSelectLead
                  ? "cursor-pointer hover:bg-accent-500/10 dark:hover:bg-accent-500/10"
                  : "hover:bg-slate-50 dark:hover:bg-ink-850"
              }`}
              title={onSelectLead ? "Click to view full lead history & details" : undefined}
            >
              <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <span>{l.name}</span>
                {onSelectLead && (
                  <span className="text-[10px] text-accent-500 opacity-0 group-hover:opacity-100 transition">↗</span>
                )}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-400 font-mono text-xs">{l.email}</td>
              {!compact && <td className="whitespace-nowrap px-4 py-3">{l.company || <span className="text-slate-400">—</span>}</td>}
              <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-400">{fmtDateTime(l.sent_at)}</td>
              <td className="max-w-[220px] truncate px-4 py-3 font-medium text-slate-700 dark:text-slate-300" title={l.subject}>{l.subject}</td>
              <td className="px-4 py-3"><StatusBadge status={l.status} /></td>
              <td className="px-4 py-3"><OpenedBadge opened={l.opened} /></td>
              {!compact && <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-400">{fmtDateTime(l.first_opened_at)}</td>}
              {!compact && <td className="px-4 py-3"><FollowupSummary lead={l} /></td>}
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
