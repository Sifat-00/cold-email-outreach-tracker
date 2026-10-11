import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import toast, { Toaster } from "react-hot-toast";
import { CalendarClock, MailX, Menu, MessageSquareReply } from "lucide-react";
import Sidebar from "./components/Sidebar.jsx";
import ConnectGmail from "./components/ConnectGmail.jsx";
import Spinner from "./components/Spinner.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Compose from "./pages/Compose.jsx";
import Leads from "./pages/Leads.jsx";
import Followups from "./pages/Followups.jsx";
import Settings from "./pages/Settings.jsx";
import Inbox from "./pages/Inbox.jsx";
import { desktopNotify } from "./lib/notify.js";
import { api } from "./lib/api.js";
import { useTheme } from "./lib/theme.js";

export default function App() {
  const [theme, toggleTheme] = useTheme();
  const [auth, setAuth] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const refreshAuth = useCallback(async () => {
    try {
      setAuth(await api.authStatus());
      setAuthError(null);
    } catch (e) {
      setAuthError(e.message);
    }
  }, []);

  useEffect(() => {
    refreshAuth();
  }, [refreshAuth]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("connected")) {
      toast.success("Gmail connected — your Google Sheet is ready");
      navigate("/", { replace: true });
      refreshAuth();
    } else if (params.get("auth_error")) {
      toast.error(`Google sign-in failed: ${params.get("detail") || params.get("auth_error")}`);
      navigate("/", { replace: true });
    }
  }, [location.search, navigate, refreshAuth]);

  useEffect(() => setMobileOpen(false), [location.pathname]);

  const [notif, setNotif] = useState(null);
  const connected = !!auth?.connected;

  const pollNotifications = useCallback(async () => {
    let n;
    try {
      n = await api.notifications();
    } catch {
      return;
    }
    setNotif(n);

    // Reply / bounce alerts for events we haven't announced yet.
    const stored = localStorage.getItem("lastEventId");
    if (stored === null) {
      localStorage.setItem("lastEventId", String(n.latest_event_id));
    } else {
      const fresh = n.events.filter((e) => e.id > Number(stored) && !e.seen).reverse();
      fresh.forEach((e) => {
        const who = e.lead_name || e.lead_email || "A lead";
        const open = () => navigate(`/inbox?thread=${e.thread_id}`);
        if (e.kind === "reply") {
          toast(
            (t) => (
              <span className="flex items-center gap-3">
                <span><b>{who}</b> replied{e.snippet ? `: “${e.snippet.slice(0, 80)}”` : ""}</span>
                <button className="btn-primary !px-3 !py-1.5 !text-xs" onClick={() => { toast.dismiss(t.id); open(); }}>Open</button>
              </span>
            ),
            { icon: <MessageSquareReply className="h-5 w-5 text-emerald-500" />, duration: 12000 }
          );
          desktopNotify(`${who} replied`, e.snippet || "Open the inbox to read it.", open);
        } else if (e.kind === "bounce") {
          toast(`${who}'s email bounced`, { icon: <MailX className="h-5 w-5 text-rose-500" />, duration: 8000 });
          desktopNotify(`Bounced: ${who}`, e.snippet || "", () => navigate("/leads"));
        }
      });
      if (n.latest_event_id > Number(stored)) localStorage.setItem("lastEventId", String(n.latest_event_id));
    }

    // Once-a-day summary of due follow-ups, then an alert whenever another one becomes due (e.g. a timed one at 10:15).
    const known = new Set(JSON.parse(localStorage.getItem("notifiedFollowups") || "[]"));
    const dueIds = n.due_leads.map((l) => l.followup_id);
    const showSummary = n.followups_due > 0 && localStorage.getItem("followupReminderDate") !== n.today;
    if (!showSummary) {
      n.due_leads.filter((l) => !known.has(l.followup_id)).forEach((l) => {
        const go = () => navigate("/followups?tab=today");
        const msg = `Follow-up #${l.next_followup_number} for ${l.name} is due now`;
        toast(
          (t) => (
            <span className="flex items-center gap-3">
              <span>{msg}</span>
              <button className="btn-primary !px-3 !py-1.5 !text-xs" onClick={() => { toast.dismiss(t.id); go(); }}>Send</button>
            </span>
          ),
          { icon: <CalendarClock className="h-5 w-5 text-amber-500" />, duration: 15000 }
        );
        desktopNotify(msg, l.email, go);
      });
    }
    localStorage.setItem("notifiedFollowups", JSON.stringify(dueIds));
    if (showSummary) {
      localStorage.setItem("followupReminderDate", n.today);
      const msg = `You have ${n.followups_due} follow-up${n.followups_due === 1 ? "" : "s"} due`;
      const go = () => navigate("/followups?tab=today");
      toast(
        (t) => (
          <span className="flex items-center gap-3">
            <span>{msg}{n.followups_overdue ? ` (${n.followups_overdue} overdue)` : ""}</span>
            <button className="btn-primary !px-3 !py-1.5 !text-xs" onClick={() => { toast.dismiss(t.id); go(); }}>View</button>
          </span>
        ),
        { icon: <CalendarClock className="h-5 w-5 text-amber-500" />, duration: 15000 }
      );
      desktopNotify(msg, n.due_leads.slice(0, 8).map((l) => l.name).join(", "), go);
    }
  }, [navigate]);

  useEffect(() => {
    if (!connected) return undefined;
    pollNotifications();
    const t = setInterval(pollNotifications, 30000);
    return () => clearInterval(t);
  }, [connected, pollNotifications]);

  const toaster = (
    <Toaster
      position="top-right"
      toastOptions={{
        error: { duration: 8000 },
        className: "!max-w-md !break-words !rounded-xl !text-sm !font-medium dark:!bg-ink-800 dark:!text-slate-100 !shadow-lg",
        success: { iconTheme: { primary: "#7c4dff", secondary: "#fff" } },
      }}
    />
  );

  if (!auth) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        {toaster}
        {authError ? (
          <div className="card max-w-md p-8 text-center">
            <p className="text-lg font-semibold">Backend not reachable</p>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{authError}</p>
            <button className="btn-primary mt-6" onClick={refreshAuth}>Retry</button>
          </div>
        ) : (
          <Spinner className="h-8 w-8" />
        )}
      </div>
    );
  }

  if (!auth.connected) {
    return (
      <>
        {toaster}
        <ConnectGmail credentialsFound={auth.credentials_found} theme={theme} toggleTheme={toggleTheme} />
      </>
    );
  }

  return (
    <div className="flex min-h-screen">
      {toaster}
      <Sidebar
        email={auth.email}
        theme={theme}
        toggleTheme={toggleTheme}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        notif={notif}
      />
      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur dark:border-ink-700 dark:bg-ink-950/80 lg:hidden">
          <button className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-ink-800" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-semibold">Cold Email Tracker</span>
          {(notif?.unread_replies > 0 || notif?.followups_due > 0) && (
            <span className="ml-auto h-2.5 w-2.5 rounded-full bg-emerald-500" aria-label="New activity" />
          )}
        </header>
        <main className="w-full flex-1 p-4 sm:p-5 lg:p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              <Routes location={location}>
                <Route path="/" element={<Dashboard notif={notif} />} />
                <Route path="/inbox" element={<Inbox notif={notif} onChange={pollNotifications} />} />
                <Route path="/compose" element={<Compose />} />
                <Route path="/leads" element={<Leads />} />
                <Route path="/followups" element={<Followups onChange={pollNotifications} />} />
                <Route path="/settings" element={<Settings auth={auth} onAuthChange={refreshAuth} />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
