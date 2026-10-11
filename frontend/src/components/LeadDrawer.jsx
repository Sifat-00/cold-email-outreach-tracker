import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import toast from "react-hot-toast";
import {
  CalendarClock, CheckCircle2, Clock, Eye, ExternalLink, Mail, MessageSquareReply,
  MousePointerClick, Send, X, FileText, ArrowRight
} from "lucide-react";
import StatusBadge, { OpenedBadge } from "./StatusBadge.jsx";
import Spinner from "./Spinner.jsx";
import CleanMessageView from "./CleanMessageView.jsx";
import { api } from "../lib/api.js";
import { fmtDate, fmtDateTime, fmtWhen } from "../lib/format.js";

export default function LeadDrawer({ lead, onClose, onUpdate }) {
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState(lead?.notes || "");
  const [savingNotes, setSavingNotes] = useState(false);

  useEffect(() => {
    if (!lead) return;
    setNotes(lead.notes || "");
    setLoading(true);
    api.leadHistory(lead.id)
      .then((data) => {
        setHistory(data);
        setNotes(data.lead?.notes || "");
      })
      .catch((err) => {
        toast.error("Could not load lead history: " + err.message);
      })
      .finally(() => setLoading(false));
  }, [lead?.id]);

  if (!lead) return null;

  const saveNotes = async () => {
    setSavingNotes(true);
    try {
      await api.updateNotes(lead.id, notes);
      toast.success("Notes saved");
      onUpdate?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingNotes(false);
    }
  };

  const messages = history?.messages || [];
  const followups = history?.followups || lead.followups || [];
  const opens = history?.opens || [];
  const clicks = history?.clicks || [];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 overflow-hidden">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        />

        <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
            className="w-screen max-w-2xl bg-white shadow-2xl dark:bg-ink-950 flex flex-col"
          >
            {/* Header */}
            <div className="border-b border-slate-200 px-6 py-5 dark:border-ink-800 flex items-start justify-between bg-slate-50/50 dark:bg-ink-900/50">
              <div className="min-w-0 flex-1 pr-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                    {lead.name}
                  </h2>
                  <StatusBadge status={lead.status} />
                  <OpenedBadge opened={lead.opened} />
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
                  <span className="font-mono">{lead.email}</span>
                  {lead.company && <span>· {lead.company}</span>}
                  <span>· Sent {fmtDateTime(lead.sent_at)}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {lead.thread_id && (
                  <Link
                    to={`/inbox?thread=${lead.thread_id}`}
                    className="chip inline-flex items-center gap-1.5 bg-accent-500/10 text-accent-600 hover:bg-accent-500/20 dark:text-accent-300"
                    title="Open full conversation in Inbox"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    <span>Open in Inbox</span>
                    <ExternalLink className="h-3 w-3 opacity-60" />
                  </Link>
                )}
                <button
                  onClick={onClose}
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-ink-800 dark:hover:text-slate-200"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-3 divide-x divide-slate-200 border-b border-slate-200 bg-white dark:divide-ink-800 dark:border-ink-800 dark:bg-ink-900 text-center">
              <div className="p-3">
                <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Opens</span>
                <p className="mt-0.5 text-base font-bold text-slate-800 dark:text-slate-100">
                  {lead.open_count || (lead.opened ? 1 : 0)}
                  <span className="ml-1 text-xs font-normal text-slate-400">
                    {lead.opened ? "times" : "none"}
                  </span>
                </p>
              </div>
              <div className="p-3">
                <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Follow-ups</span>
                <p className="mt-0.5 text-base font-bold text-slate-800 dark:text-slate-100">
                  {lead.followups_sent} / {lead.followups_total}
                  <span className="ml-1 text-xs font-normal text-slate-400">sent</span>
                </p>
              </div>
              <div className="p-3">
                <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Next Step</span>
                <p className="mt-0.5 text-xs font-medium text-slate-700 dark:text-slate-200 truncate px-1">
                  {lead.replied ? (
                    <span className="text-emerald-500 font-semibold">Replied</span>
                  ) : lead.bounced ? (
                    <span className="text-rose-500 font-semibold">Bounced</span>
                  ) : lead.next_followup_date ? (
                    `#${lead.next_followup_number} ${fmtWhen(lead.next_followup_date, lead.next_followup_time)}`
                  ) : (
                    "Sequence complete"
                  )}
                </p>
              </div>
            </div>

            {/* Content Drawer Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {loading ? (
                <div className="flex justify-center py-20">
                  <Spinner className="h-8 w-8 text-accent-500" />
                </div>
              ) : (
                <>
                  {/* Timeline section */}
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-1.5">
                      <Clock className="h-4 w-4 text-accent-500" /> Complete Outreach Timeline
                    </h3>

                    <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-ink-800">

                      {/* 1. Initial Pitch Email */}
                      <div className="relative">
                        <div className="absolute -left-6 top-1 h-4 w-4 rounded-full border-2 border-accent-500 bg-white dark:bg-ink-950" />
                        <div className="card p-4 ring-1 ring-accent-500/20">
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span className="chip bg-accent-500/10 text-accent-600 dark:text-accent-300 font-semibold text-xs">
                              #1 Initial Cold Email
                            </span>
                            <span className="text-xs text-slate-400">{fmtDateTime(lead.sent_at)}</span>
                          </div>
                          <p className="font-semibold text-sm text-slate-800 dark:text-slate-100 mb-1">
                            {lead.subject}
                          </p>
                          <div className="mt-2 text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 dark:bg-ink-850 font-sans leading-relaxed border border-slate-100 dark:border-ink-800">
                            {lead.body}
                          </div>
                        </div>
                      </div>

                      {/* 2. Follow-ups (Both sent and scheduled) */}
                      {followups.map((f, i) => (
                        <div key={f.id || i} className="relative">
                          <div className={`absolute -left-6 top-1 h-4 w-4 rounded-full border-2 ${
                            f.sent ? "border-emerald-500 bg-emerald-500" : "border-amber-500 bg-white dark:bg-ink-950"
                          }`} />
                          <div className="card p-4">
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <span className={`chip text-xs font-semibold ${
                                f.sent
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                              }`}>
                                Follow-up #{f.number || i + 1} {f.sent ? "✓ Sent" : "⏳ Scheduled"}
                              </span>
                              <span className="text-xs text-slate-400">
                                {f.sent ? fmtDateTime(f.sent_at) : fmtWhen(f.scheduled_date, f.scheduled_time)}
                              </span>
                            </div>

                            {f.subject && (
                              <p className="font-medium text-xs text-slate-500 dark:text-slate-400 mb-1">
                                {f.subject}
                              </p>
                            )}

                            {f.body ? (
                              <div className="mt-2 text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 dark:bg-ink-850 font-sans leading-relaxed border border-slate-100 dark:border-ink-800">
                                {f.body}
                              </div>
                            ) : (
                              <p className="text-xs italic text-slate-400">
                                {f.sent ? "Body not recorded." : "Will be written when you click Send follow-up."}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}

                      {/* 3. Inbound Client Replies */}
                      {messages.filter((m) => m.direction === "inbound").map((m) => (
                        <div key={m.id} className="relative">
                          <div className="absolute -left-6 top-1 h-4 w-4 rounded-full border-2 border-emerald-500 bg-emerald-500" />
                          <div className="card p-4 ring-1 ring-emerald-500/30 bg-emerald-500/[0.04]">
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <span className="chip bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 font-bold text-xs flex items-center gap-1">
                                <MessageSquareReply className="h-3.5 w-3.5" /> Client Replied
                              </span>
                              <span className="text-xs text-slate-400">{fmtDateTime(m.sent_at)}</span>
                            </div>
                            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                              From: {m.sender}
                            </p>
                            <div className="mt-2.5 rounded-xl bg-white p-3.5 border border-emerald-500/25 dark:bg-ink-900 shadow-xs">
                              <CleanMessageView content={m.body_text || m.snippet} />
                            </div>
                            {lead.thread_id && (
                              <Link
                                to={`/inbox?thread=${lead.thread_id}`}
                                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
                              >
                                View full thread &amp; reply in Inbox <ArrowRight className="h-3 w-3" />
                              </Link>
                            )}
                          </div>
                        </div>
                      ))}

                      {/* 4. Open Tracking Logs */}
                      {opens.length > 0 && (
                        <div className="relative">
                          <div className="absolute -left-6 top-1 h-4 w-4 rounded-full border-2 border-sky-500 bg-sky-500" />
                          <div className="card p-4">
                            <span className="chip bg-sky-500/10 text-sky-600 dark:text-sky-400 font-semibold text-xs flex items-center gap-1 w-fit mb-3">
                              <Eye className="h-3.5 w-3.5" /> Open Tracking History ({opens.length} hit{opens.length === 1 ? "" : "s"})
                            </span>
                            <div className="space-y-2">
                              {opens.slice(0, 8).map((o, idx) => (
                                <div key={o.id || idx} className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 border-b border-slate-100 pb-1.5 last:border-0 dark:border-ink-800">
                                  <span className="font-medium text-slate-700 dark:text-slate-300">
                                    Open #{opens.length - idx}
                                  </span>
                                  <span className="font-mono text-[11px] text-slate-400">
                                    {o.ip_address || "remote"}
                                  </span>
                                  <span>{fmtDateTime(o.opened_at)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                    </div>
                  </div>

                  {/* Notes Section */}
                  <div className="card p-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                      <FileText className="h-4 w-4 text-accent-500" /> Notes (Google Sheet Column O)
                    </h3>
                    <textarea
                      className="input min-h-[90px] text-xs resize-y"
                      placeholder="Add personal notes, call details, or deal notes for this lead..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                    <div className="mt-2.5 flex justify-end">
                      <button
                        className="btn-primary !py-1.5 !px-3 text-xs"
                        onClick={saveNotes}
                        disabled={savingNotes}
                      >
                        {savingNotes ? "Saving..." : "Save Notes"}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-slate-200 p-4 dark:border-ink-800 bg-slate-50/50 dark:bg-ink-900/50 flex justify-end gap-2">
              <button className="btn-ghost !py-2 text-xs" onClick={onClose}>
                Close
              </button>
              {lead.thread_id && (
                <Link to={`/inbox?thread=${lead.thread_id}`} className="btn-primary !py-2 text-xs">
                  <Mail className="h-4 w-4" /> Open Conversation in Inbox
                </Link>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </AnimatePresence>
  );
}
