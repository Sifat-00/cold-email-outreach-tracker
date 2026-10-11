import { NavLink } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, CalendarClock, Inbox, LayoutDashboard, Mail, Moon, Send, Settings, Sun, Users, X } from "lucide-react";
import { useNotificationPermission } from "../lib/notify.js";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/inbox", label: "Inbox", icon: Inbox, badge: "unread_replies", tone: "bg-emerald-500" },
  { to: "/compose", label: "Compose & Send", icon: Send },
  { to: "/leads", label: "Leads", icon: Users },
  { to: "/followups", label: "Follow-ups", icon: CalendarClock, badge: "followups_due", tone: "bg-amber-500" },
  { to: "/settings", label: "Settings", icon: Settings },
];

function Content({ email, theme, toggleTheme, onClose, notif }) {
  const [perm, requestPerm] = useNotificationPermission();
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent-500 to-indigo-600 shadow-glow">
            <Mail className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold leading-tight">Cold Email</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Outreach Tracker</p>
          </div>
        </div>
        {onClose && (
          <button className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-ink-800 lg:hidden" onClick={onClose} aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {NAV.map(({ to, label, icon: Icon, end, badge, tone }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                isActive
                  ? "bg-accent-500/10 text-accent-600 dark:bg-accent-500/15 dark:text-accent-300"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-ink-800 dark:hover:text-slate-200"
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span layoutId="nav-pill" className="absolute left-0 top-2 bottom-2 w-1 rounded-r bg-accent-500" />
                )}
                <Icon className="h-[18px] w-[18px]" />
                {label}
                {badge && notif?.[badge] > 0 && (
                  <span className={`ml-auto min-w-[1.25rem] rounded-full px-1.5 py-0.5 text-center text-[11px] font-bold leading-none text-white ${tone}`}>
                    {notif[badge] > 99 ? "99+" : notif[badge]}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="space-y-3 border-t border-slate-200 p-4 dark:border-ink-700">
        {perm === "default" && (
          <button onClick={requestPerm} className="flex w-full items-center gap-2 rounded-xl bg-accent-500/10 px-3 py-2 text-left text-xs font-semibold text-accent-600 hover:bg-accent-500/20 dark:text-accent-300">
            <Bell className="h-4 w-4 shrink-0" /> Enable desktop alerts for replies &amp; follow-ups
          </button>
        )}
        <button onClick={toggleTheme} className="btn-ghost w-full !justify-start !py-2">
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </button>
        {email && (
          <div className="flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 dark:bg-ink-850">
            <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
            <span className="truncate text-xs text-slate-600 dark:text-slate-400" title={email}>{email}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Sidebar({ email, theme, toggleTheme, mobileOpen, onClose, notif }) {
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200 bg-white dark:border-ink-700 dark:bg-ink-900 lg:block">
        <Content email={email} theme={theme} toggleTheme={toggleTheme} notif={notif} />
      </aside>
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/50 lg:hidden"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={onClose}
            />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 w-72 border-r border-slate-200 bg-white dark:border-ink-700 dark:bg-ink-900 lg:hidden"
              initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
            >
              <Content email={email} theme={theme} toggleTheme={toggleTheme} onClose={onClose} notif={notif} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
