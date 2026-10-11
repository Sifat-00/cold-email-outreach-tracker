import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowRight, BellRing, CalendarClock, Eye, Inbox, MailX, MessageSquareReply, Percent, RefreshCw, Send, TrendingUp } from "lucide-react";
import PageHeader from "../components/PageHeader.jsx";
import StatsCard from "../components/StatsCard.jsx";
import LeadsTable from "../components/LeadsTable.jsx";
import EmptyState from "../components/EmptyState.jsx";
import Spinner from "../components/Spinner.jsx";
import { api } from "../lib/api.js";

function Reminders({ notif }) {
  if (!notif || (!notif.followups_due && !notif.unread_replies)) return null;
  return (
    <div className="mb-6 grid gap-4 md:grid-cols-2">
      {notif.followups_due > 0 && (
        <div className="card flex items-start gap-4 border-amber-500/30 bg-amber-500/5 p-5 dark:border-amber-500/30 dark:bg-amber-500/5">
          <div className="rounded-xl bg-amber-500/15 p-2.5"><BellRing className="h-5 w-5 text-amber-500" /></div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {notif.followups_due} follow-up{notif.followups_due === 1 ? "" : "s"} due now
              {notif.followups_overdue > 0 && <span className="text-sm font-medium text-amber-600 dark:text-amber-400"> · {notif.followups_overdue} overdue</span>}
            </p>
            <p className="mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400">
              {notif.due_leads.slice(0, 8).map((l) => l.name).join(", ")}{notif.due_leads.length > 8 ? "…" : ""}
            </p>
            <Link to="/followups?tab=today" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-amber-600 hover:underline dark:text-amber-400">
              Send them now <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}
      {notif.unread_replies > 0 && (
        <div className="card flex items-start gap-4 border-emerald-500/30 bg-emerald-500/5 p-5 dark:border-emerald-500/30 dark:bg-emerald-500/5">
          <div className="rounded-xl bg-emerald-500/15 p-2.5"><MessageSquareReply className="h-5 w-5 text-emerald-500" /></div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{notif.unread_replies} new repl{notif.unread_replies === 1 ? "y" : "ies"}</p>
            <p className="mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400">
              {[...new Set(notif.events.filter((e) => e.kind === "reply" && !e.seen).map((e) => e.lead_name || e.lead_email))].join(", ")}
            </p>
            <Link to="/inbox" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-emerald-600 hover:underline dark:text-emerald-400">
              Open inbox <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Dashboard({ notif }) {
  const [stats, setStats] = useState(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    try {
      setStats(await api.stats());
    } catch (e) {
      toast.error(e.message);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const syncNow = async () => {
    setSyncing(true);
    try {
      const r = await api.sync();
      toast.success(`Synced ${r.checked} threads · ${r.replies.length} new replies · ${r.bounces.length} new bounces`);
      await load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSyncing(false);
    }
  };

  const cards = stats
    ? [
        { label: "Total Sent", value: stats.total_sent, icon: Send, tone: "violet" },
        { label: "Replied", value: stats.replied, icon: MessageSquareReply, tone: "emerald" },
        { label: "Bounced", value: stats.bounced, icon: MailX, tone: "rose" },
        { label: "Opened", value: stats.opened, icon: Eye, tone: "sky" },
        { label: "Pending Follow-ups", value: stats.pending_followups, icon: CalendarClock, tone: "amber" },
        { label: "Reply Rate", value: stats.reply_rate, suffix: "%", icon: TrendingUp, tone: "emerald" },
        { label: "Open Rate", value: stats.open_rate, suffix: "%", icon: Percent, tone: "indigo" },
      ]
    : [];

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Replies and bounces are checked automatically every minute · times in Asia/Dhaka"
        actions={
          <>
            <button className="btn-ghost" onClick={syncNow} disabled={syncing}>
              {syncing ? <Spinner /> : <RefreshCw className="h-4 w-4" />} Sync now
            </button>
            <Link to="/compose" className="btn-primary"><Send className="h-4 w-4" /> New email</Link>
          </>
        }
      />
      <Reminders notif={notif} />
      {!stats ? (
        <div className="flex justify-center py-20"><Spinner className="h-8 w-8" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {cards.map((c, i) => <StatsCard key={c.label} index={i} {...c} />)}
          </div>
          <div className="card mt-8">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-ink-700">
              <h2 className="font-semibold">Recent activity</h2>
              <Link to="/leads" className="text-sm font-medium text-accent-600 hover:underline dark:text-accent-400">View all</Link>
            </div>
            {stats.recent.length ? (
              <LeadsTable leads={stats.recent} compact />
            ) : (
              <EmptyState
                icon={Inbox}
                title="No emails sent yet"
                description="Send your first cold email and it will show up here."
                action={<Link to="/compose" className="btn-primary"><Send className="h-4 w-4" /> Compose</Link>}
              />
            )}
          </div>
        </>
      )}
    </>
  );
}
