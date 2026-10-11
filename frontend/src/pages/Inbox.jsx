import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft, CalendarClock, ChevronDown, ChevronUp, Inbox as InboxIcon, Mail, MailOpen, MessageSquareReply,
  Paperclip, PenSquare, RefreshCw, Search, Send, Users, X,
} from "lucide-react";
import Spinner from "../components/Spinner.jsx";
import EmptyState from "../components/EmptyState.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { cleanHtmlQuotes, fmtDate, fmtDateTime, fmtShort } from "../lib/format.js";

const VIEWS = [
  { key: "replies", label: "Replies", icon: MessageSquareReply, hint: "Leads who replied" },
  { key: "leads", label: "All leads", icon: Users, hint: "Every outreach thread" },
  { key: "all", label: "Gmail inbox", icon: InboxIcon, hint: "Your whole Gmail inbox" },
];

function Avatar({ name, small, isClient }) {
  const letter = (name || "?").trim().charAt(0).toUpperCase();
  const bg = isClient
    ? "bg-gradient-to-br from-emerald-500 to-teal-600"
    : "bg-gradient-to-br from-accent-500 to-indigo-600";
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white shadow-sm ${bg} ${small ? "h-8 w-8 text-xs" : "h-9 w-9 text-sm"}`}>
      {letter}
    </span>
  );
}

function ThreadRow({ t, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full gap-3 border-b border-slate-100 px-4 py-3 text-left transition last:border-0 dark:border-ink-800 ${
        active ? "bg-accent-500/10" : "hover:bg-slate-50 dark:hover:bg-ink-850"
      }`}
    >
      <Avatar name={t.lead?.name || t.participants} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className={`truncate text-sm ${t.unread ? "font-bold" : "font-medium text-slate-700 dark:text-slate-300"}`}>
            {t.lead?.name || t.participants || "(unknown)"}
            {t.count > 1 && <span className="ml-1 text-xs font-normal text-slate-400">{t.count}</span>}
          </p>
          <span className={`ml-auto shrink-0 text-xs ${t.unread ? "font-semibold text-accent-600 dark:text-accent-300" : "text-slate-400"}`}>
            {fmtShort(t.date)}
          </span>
        </div>
        <p className={`truncate text-sm ${t.unread ? "font-semibold" : "text-slate-600 dark:text-slate-400"}`}>{t.subject}</p>
        <div className="mt-0.5 flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-xs text-slate-400">
            {t.last_from_me && t.count > 0 && <span className="text-slate-500">You: </span>}
            {t.snippet || (t.missing ? "Thread not found in Gmail" : "")}
          </p>
          {t.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-accent-500" />}
          {t.lead && <StatusBadge status={t.lead.status} />}
        </div>
      </div>
    </button>
  );
}

function EmailFrame({ html }) {
  const ref = useRef(null);
  const [height, setHeight] = useState(80);
  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  const css = isDark
    ? `body{margin:0;padding:16px;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:14px;line-height:1.6;color:#e2e8f0;background:#161624;word-wrap:break-word}
       img{max-width:100%;height:auto}
       blockquote, .gmail_quote{margin:12px 0 0 4px;padding-left:12px;border-left:2px solid #3a3a55;color:#94a3b8;font-size:13px}
       pre{white-space:pre-wrap;font-family:inherit}
       a{color:#a78bfa;text-decoration:underline}`
    : `body{margin:0;padding:16px;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:14px;line-height:1.6;color:#1e293b;background:#ffffff;word-wrap:break-word}
       img{max-width:100%;height:auto}
       blockquote, .gmail_quote{margin:12px 0 0 4px;padding-left:12px;border-left:2px solid #cbd5e1;color:#64748b;font-size:13px}
       pre{white-space:pre-wrap;font-family:inherit}
       a{color:#6a35f5;text-decoration:underline}`;

  const doc = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>${css}</style></head><body>${html || "<p style='color:#94a3b8'>(no content)</p>"}</body></html>`;

  useEffect(() => {
    const frame = ref.current;
    if (!frame) return undefined;
    let ro;
    const measure = () => {
      const root = frame.contentDocument?.documentElement;
      if (root) setHeight(Math.min(Math.max(root.scrollHeight + 4, 60), 4000));
    };
    const fit = () => {
      const body = frame.contentDocument?.body;
      if (!body) return;
      measure();
      if (!ro && window.ResizeObserver) {
        ro = new ResizeObserver(measure);
        ro.observe(body);
      }
    };
    frame.addEventListener("load", fit);
    return () => {
      frame.removeEventListener("load", fit);
      ro?.disconnect();
    };
  }, [html]);

  return (
    <iframe
      ref={ref}
      title="email"
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={doc}
      style={{ height }}
      scrolling="no"
      className="w-full rounded-xl border border-slate-200/80 bg-white transition-colors dark:border-ink-700/80 dark:bg-ink-850"
    />
  );
}

function Message({ m, index = 0, expanded, onToggle }) {
  const isMe = m.from_me;
  const isClientReply = !isMe;

  // Compute clean role label
  let roleLabel = "";
  if (isClientReply) {
    roleLabel = "Client Reply";
  } else if (index === 0) {
    roleLabel = "Initial Outreach";
  } else {
    roleLabel = `Follow-up #${index}`;
  }

  return (
    <div className={`overflow-hidden rounded-2xl border transition-all ${
      isClientReply
        ? "border-emerald-500/35 bg-emerald-500/[0.03] shadow-sm dark:border-emerald-500/30 dark:bg-emerald-500/[0.04]"
        : "border-slate-200/90 bg-white shadow-sm dark:border-ink-700/80 dark:bg-ink-900"
    }`}>
      <button onClick={onToggle} className="flex w-full items-start gap-3.5 p-4 text-left transition hover:bg-slate-50/50 dark:hover:bg-ink-850/50">
        <Avatar name={isMe ? "Me" : m.from.name} small isClient={isClientReply} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {isMe ? "You" : m.from.name}
            </span>
            <span className="truncate font-mono text-xs text-slate-400 dark:text-slate-500">
              &lt;{m.from.email}&gt;
            </span>

            <span className={`chip ml-1 text-[11px] font-semibold ring-1 ring-inset ${
              isClientReply
                ? "bg-emerald-500/15 text-emerald-600 ring-emerald-500/30 dark:text-emerald-400"
                : index === 0
                ? "bg-accent-500/10 text-accent-600 ring-accent-500/25 dark:text-accent-300"
                : "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-ink-800 dark:text-slate-300 dark:ring-ink-700"
            }`}>
              {roleLabel}
            </span>

            <span className="ml-auto flex items-center gap-2 text-xs text-slate-400">
              <span>{fmtDateTime(m.date)}</span>
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </span>
          </div>

          {!expanded ? (
            <p className="mt-1.5 truncate text-xs text-slate-500 dark:text-slate-400">
              {m.snippet}
            </p>
          ) : (
            <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-400">
              <span>To: {m.to}</span>
              {m.cc && <span>· Cc: {m.cc}</span>}
            </div>
          )}
        </div>
      </button>

      {expanded && (
        <div className="space-y-3 px-4 pb-4 pt-1">
          <EmailFrame html={m.html} />
          {m.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {m.attachments.map((a) => (
                <a key={a.attachment_id} href={api.attachmentUrl(m.id, a)} className="chip inline-flex items-center gap-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-ink-850 dark:text-slate-300 dark:hover:bg-ink-800">
                  <Paperclip className="h-3.5 w-3.5" /> {a.filename}
                  <span className="text-slate-400">{Math.max(1, Math.round(a.size / 1024))} KB</span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReplyBox({ thread, onSent }) {
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setTo(thread.reply?.to || "");
    setCc("");
    setShowCc(false);
    setBody("");
  }, [thread.id, thread.reply?.to]);

  const replyAll = () => {
    setCc(thread.reply?.cc_all || "");
    setShowCc(true);
  };

  const send = async () => {
    if (!body.trim() || !to.trim()) return;
    setSending(true);
    try {
      await api.reply({ thread_id: thread.id, to, cc: cc || null, subject: thread.reply?.subject, body });
      toast.success("Reply sent");
      setBody("");
      onSent();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="card p-4">
      <div className="mb-2 flex items-center gap-2 text-sm">
        <MessageSquareReply className="h-4 w-4 text-accent-500" />
        <span className="font-semibold">Reply</span>
        <span className="text-xs text-slate-400">· sent in this Gmail thread</span>
        <div className="ml-auto flex gap-1">
          {thread.reply?.cc_all && <button type="button" className="chip text-accent-600 hover:bg-accent-500/10 dark:text-accent-300" onClick={replyAll}>Reply all</button>}
          {!showCc && <button type="button" className="chip text-slate-500 hover:bg-slate-100 dark:hover:bg-ink-800" onClick={() => setShowCc(true)}>Cc</button>}
        </div>
      </div>
      <div className="mb-2 flex items-center gap-2">
        <span className="w-8 text-xs font-semibold text-slate-400">To</span>
        <input className="input !py-1.5" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      {showCc && (
        <div className="mb-2 flex items-center gap-2">
          <span className="w-8 text-xs font-semibold text-slate-400">Cc</span>
          <input className="input !py-1.5" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="a@x.com, b@y.com" />
        </div>
      )}
      <textarea
        className="input min-h-[120px] resize-y"
        placeholder="Write your reply…  (Ctrl+Enter to send)"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") send(); }}
      />
      <div className="mt-3 flex justify-end">
        <button className="btn-primary" onClick={send} disabled={sending || !body.trim() || !to.trim()}>
          {sending ? <Spinner className="h-4 w-4 !text-white" /> : <Send className="h-4 w-4" />} Send reply
        </button>
      </div>
    </div>
  );
}

function LeadBar({ lead }) {
  if (!lead) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-accent-500/5 px-4 py-2.5 text-sm ring-1 ring-inset ring-accent-500/15">
      <span className="font-semibold">{lead.name}</span>
      {lead.company && <span className="text-slate-500 dark:text-slate-400">· {lead.company}</span>}
      <StatusBadge status={lead.status} />
      {lead.opened && <span className="text-xs font-semibold text-accent-600 dark:text-accent-300">Opened</span>}
      {lead.pending_followup && (
        <Link to="/followups" className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-amber-600 hover:underline dark:text-amber-400">
          <CalendarClock className="h-3.5 w-3.5" /> Next follow-up {fmtDate(lead.next_followup_date)}
        </Link>
      )}
    </div>
  );
}

function ThreadView({ id, onBack, onLoaded }) {
  const [thread, setThread] = useState(null);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState({});

  const load = useCallback(async (quiet) => {
    if (!quiet) setThread(null);
    setError(null);
    try {
      const t = await api.thread(id);
      setThread(t);
      const exp = {};
      t.messages.forEach((m, i) => { if (i === t.messages.length - 1 || m.unread) exp[m.id] = true; });
      setExpanded(exp);
      onLoaded?.();
    } catch (e) {
      setError(e.message);
    }
  }, [id, onLoaded]);

  useEffect(() => { load(); }, [load]);

  if (error) return <div className="card p-8 text-center text-sm text-rose-500">{error}</div>;
  if (!thread) return <div className="flex justify-center py-20"><Spinner className="h-8 w-8" /></div>;

  const allExpanded = thread.messages.length > 0 && thread.messages.every((m) => !!expanded[m.id]);
  const toggleAll = () => {
    const next = {};
    thread.messages.forEach((m) => { next[m.id] = !allExpanded; });
    setExpanded(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-1">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={onBack} className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-ink-800 lg:hidden" aria-label="Back to list">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h2 className="truncate text-lg font-bold leading-snug text-slate-900 dark:text-slate-100">
            {thread.subject || "(no subject)"}
          </h2>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          <span className="chip bg-slate-100 text-slate-600 font-medium dark:bg-ink-850 dark:text-slate-400">
            {thread.messages.length} message{thread.messages.length === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={toggleAll}
            className="chip bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-ink-850 dark:text-slate-300 dark:hover:bg-ink-800"
          >
            {allExpanded ? "Collapse all" : "Expand all"}
          </button>
        </div>
      </div>
      <LeadBar lead={thread.lead} />
      {thread.messages.map((m, i) => (
        <Message
          key={m.id}
          m={m}
          index={i}
          total={thread.messages.length}
          expanded={!!expanded[m.id]}
          onToggle={() => setExpanded((x) => ({ ...x, [m.id]: !x[m.id] }))}
        />
      ))}
      <ReplyBox thread={thread} onSent={() => load(true)} />
    </div>
  );
}

function ComposeModal({ open, onClose, onSent }) {
  const empty = { to: "", cc: "", subject: "", body: "" };
  const [f, setF] = useState(empty);
  const [track, setTrack] = useState(true);
  const [sending, setSending] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  useEffect(() => { if (open) setF(empty); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      if (track) {
        const r = await api.send({ to: f.to.trim(), subject: f.subject, body: f.body });
        toast.success(`Sent to ${f.to} · added to Leads`);
        if (r.sheet_error) toast.error(`Sheet update failed: ${r.sheet_error}`);
      } else {
        await api.inboxSend({ to: f.to, cc: f.cc || null, subject: f.subject, body: f.body });
        toast.success(`Sent to ${f.to}`);
      }
      onSent();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.form onSubmit={submit} onClick={(e) => e.stopPropagation()}
            initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }}
            className="card max-h-[95vh] w-full max-w-xl overflow-y-auto rounded-b-none p-6 sm:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">New email</h2>
              <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-ink-800"><X className="h-5 w-5" /></button>
            </div>
            <label className="mb-4 flex cursor-pointer items-start gap-3 rounded-xl bg-accent-500/5 p-3 ring-1 ring-inset ring-accent-500/15">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-accent-600" checked={track} onChange={(e) => setTrack(e.target.checked)} />
              <span className="text-sm">
                <span className="font-semibold">Track as outreach lead</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">Adds open tracking, default follow-ups and a Google Sheet row. Untick for a normal email.</span>
              </span>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label">To</label>
                <input className="input" type={track ? "email" : "text"} value={f.to} onChange={set("to")} required placeholder="name@company.com" />
              </div>
              {!track && (
                <div className="sm:col-span-2"><label className="label">Cc</label><input className="input" value={f.cc} onChange={set("cc")} /></div>
              )}
              <div className="sm:col-span-2"><label className="label">Subject</label><input className="input" value={f.subject} onChange={set("subject")} required /></div>
              <div className="sm:col-span-2"><label className="label">Message</label><textarea className="input min-h-[180px] resize-y" value={f.body} onChange={set("body")} required /></div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn-primary" disabled={sending}>
                {sending ? <Spinner className="h-4 w-4 !text-white" /> : <Send className="h-4 w-4" />} Send
              </button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function Inbox({ notif, onChange }) {
  const [params, setParams] = useSearchParams();
  const view = params.get("view") || "replies";
  const selected = params.get("thread");
  const [items, setItems] = useState(null);
  const [more, setMore] = useState({ has: false, page: 0, token: null });
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [composing, setComposing] = useState(false);

  const setParam = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next, { replace: false });
  };

  const load = useCallback(async (quiet) => {
    if (!quiet) setItems(null);
    try {
      const r = await api.inbox({ view, q: query });
      setItems(r.items);
      setMore({ has: r.has_more, page: 0, token: r.next_page_token });
    } catch (e) {
      toast.error(e.message);
      setItems([]);
    }
  }, [view, query]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => load(true), 60000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => { if (notif?.latest_event_id) load(true); }, [notif?.latest_event_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const r = await api.inbox({ view, q: query, page: more.page + 1, pageToken: more.token });
      setItems((x) => [...x, ...r.items]);
      setMore({ has: r.has_more, page: more.page + 1, token: r.next_page_token });
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoadingMore(false);
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    try { await api.sync(); } catch { /* sync is best effort */ }
    await load(true);
    onChange?.();
    setRefreshing(false);
  };

  const onThreadLoaded = useCallback(() => {
    setItems((x) => x && x.map((t) => (t.id === selected ? { ...t, unread: false } : t)));
    onChange?.();
  }, [selected, onChange]);

  const current = VIEWS.find((v) => v.key === view) || VIEWS[0];

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inbox</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Read and reply without opening Gmail{notif?.unread_replies ? ` · ${notif.unread_replies} new repl${notif.unread_replies === 1 ? "y" : "ies"}` : ""}
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          <button className="btn-ghost" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </button>
          <button className="btn-primary" onClick={() => setComposing(true)}><PenSquare className="h-4 w-4" /> Compose</button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[330px_1fr] xl:grid-cols-[350px_1fr]">
        <section className={`card flex flex-col overflow-hidden lg:h-[calc(100vh-11rem)] ${selected ? "hidden lg:flex" : "flex"}`}>
          <div className="flex gap-1 border-b border-slate-200 p-2 dark:border-ink-700">
            {VIEWS.map((v) => (
              <button key={v.key} onClick={() => setParam({ view: v.key === "replies" ? null : v.key, thread: null })} title={v.hint}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition ${
                  view === v.key ? "bg-accent-500/15 text-accent-600 dark:text-accent-300" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-ink-800"
                }`}>
                <v.icon className="h-4 w-4" /> {v.label}
                {v.key === "replies" && notif?.unread_replies > 0 && (
                  <span className="rounded-full bg-emerald-500 px-1.5 text-[10px] text-white">{notif.unread_replies}</span>
                )}
              </button>
            ))}
          </div>
          <form className="relative border-b border-slate-200 p-2 dark:border-ink-700" onSubmit={(e) => { e.preventDefault(); setQuery(search.trim()); }}>
            <Search className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input !py-2 !pl-9" placeholder={view === "all" ? "Search Gmail (same syntax as Gmail)…" : "Search name, email, company, subject…"}
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </form>
          <div className="flex-1 overflow-y-auto">
            {!items ? (
              <div className="flex justify-center py-16"><Spinner className="h-7 w-7" /></div>
            ) : items.length === 0 ? (
              <EmptyState icon={view === "replies" ? MessageSquareReply : Mail}
                title={query ? "No matches" : view === "replies" ? "No replies yet" : "Nothing here"}
                description={view === "replies" ? "When a lead replies, it shows up here and you get an alert." : current.hint} />
            ) : (
              <>
                {items.map((t) => <ThreadRow key={t.id} t={t} active={t.id === selected} onClick={() => setParam({ thread: t.id })} />)}
                {more.has && (
                  <div className="p-3 text-center">
                    <button className="btn-ghost !py-2 text-xs" onClick={loadMore} disabled={loadingMore}>
                      {loadingMore ? <Spinner className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />} Load more
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        <section className={`min-w-0 lg:h-[calc(100vh-11rem)] lg:overflow-y-auto lg:pr-1 ${selected ? "block" : "hidden lg:block"}`}>
          {selected ? (
            <ThreadView key={selected} id={selected} onBack={() => setParam({ thread: null })} onLoaded={onThreadLoaded} />
          ) : (
            <div className="card flex h-full items-center justify-center">
              <EmptyState icon={MailOpen} title="Select a conversation" description="Pick a thread on the left to read it and reply in the same Gmail thread." />
            </div>
          )}
        </section>
      </div>

      <ComposeModal open={composing} onClose={() => setComposing(false)} onSent={() => { setComposing(false); load(true); }} />
    </>
  );
}
