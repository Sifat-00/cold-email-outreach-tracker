import { useState } from "react";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { AlertTriangle, FileSpreadsheet, Mail, MailCheck, Moon, Sun } from "lucide-react";
import Spinner from "./Spinner.jsx";
import { api } from "../lib/api.js";

export default function ConnectGmail({ credentialsFound, theme, toggleTheme }) {
  const [loading, setLoading] = useState(false);

  const connect = async () => {
    setLoading(true);
    try {
      const { auth_url } = await api.startAuth();
      window.location.href = auth_url;
    } catch (e) {
      toast.error(e.message);
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-6">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-accent-500/20 blur-3xl" />
      <button onClick={toggleTheme} className="btn-ghost absolute right-4 top-4 !p-2.5" aria-label="Toggle theme">
        {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="card relative w-full max-w-md p-8 text-center"
      >
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-500 to-indigo-600 shadow-glow">
          <Mail className="h-7 w-7 text-white" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Cold Email Tracker</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Connect your Gmail to send outreach, track opens, replies and bounces, and keep a Google Sheet in sync automatically.
        </p>
        <ul className="mt-6 space-y-2.5 text-left text-sm">
          <li className="flex items-center gap-3"><MailCheck className="h-4 w-4 text-accent-500" /> Send from your own Gmail account</li>
          <li className="flex items-center gap-3"><FileSpreadsheet className="h-4 w-4 text-accent-500" /> "Cold Email Tracker" sheet created for you</li>
        </ul>
        {!credentialsFound && (
          <div className="mt-6 flex items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-left text-xs text-amber-700 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            credentials.json was not found in the project root. Add it and restart the backend.
          </div>
        )}
        <button onClick={connect} disabled={loading || !credentialsFound} className="btn-primary mt-7 w-full !py-3">
          {loading ? <Spinner className="h-4 w-4 !text-white" /> : <Mail className="h-4 w-4" />}
          Connect Gmail
        </button>
      </motion.div>
    </div>
  );
}
