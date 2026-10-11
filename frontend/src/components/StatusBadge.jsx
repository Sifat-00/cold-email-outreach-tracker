const STYLES = {
  Sent: "bg-sky-500/10 text-sky-600 ring-sky-500/20 dark:text-sky-300",
  Replied: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-300",
  Bounced: "bg-rose-500/10 text-rose-600 ring-rose-500/20 dark:text-rose-300",
};

export default function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${STYLES[status] || STYLES.Sent}`}>
      {status}
    </span>
  );
}

export function OpenedBadge({ opened }) {
  return opened ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent-500/10 px-2.5 py-0.5 text-xs font-semibold text-accent-600 ring-1 ring-inset ring-accent-500/20 dark:text-accent-300">
      <span className="h-1.5 w-1.5 rounded-full bg-accent-500" /> Opened
    </span>
  ) : (
    <span className="text-xs text-slate-400">Not yet</span>
  );
}
