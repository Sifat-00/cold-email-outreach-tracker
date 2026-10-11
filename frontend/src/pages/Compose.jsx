import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { motion } from "framer-motion";
import { Eye, Send } from "lucide-react";
import PageHeader from "../components/PageHeader.jsx";
import Spinner from "../components/Spinner.jsx";
import { api } from "../lib/api.js";
import FollowupPlanner, { planError, planFromDays, planToPayload } from "../components/FollowupPlanner.jsx";

const EMPTY = { to: "", subject: "", body: "" };

export default function Compose() {
  const [form, setForm] = useState(EMPTY);
  const [sending, setSending] = useState(false);
  const [settings, setSettings] = useState(null);
  const [plan, setPlan] = useState(null);
  const defaults = settings?.followup_days ?? [3, 5, 7];

  useEffect(() => {
    api.settings().then((s) => { setSettings(s); setPlan(planFromDays(s.followup_days ?? [3, 5, 7])); }).catch(() => {});
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const err = plan && planError(plan);
    if (err) return toast.error(err);
    setSending(true);
    try {
      const res = await api.send({ ...form, followups: plan ? planToPayload(plan) : undefined });
      const n = res.lead.followups_total;
      toast.success(`Email sent to ${res.lead.email} · ${n} follow-up${n === 1 ? "" : "s"} scheduled`);
      if (res.sheet_error) toast.error(`Saved, but Google Sheet update failed: ${res.sheet_error}`);
      setForm(EMPTY);
      setPlan(planFromDays(defaults));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  };

  const localOnly = settings?.backend_url?.includes("localhost") || settings?.backend_url?.includes("127.0.0.1");

  return (
    <>
      <PageHeader title="Compose & Send" subtitle="A tracking pixel is added automatically to every email." />
      <motion.form onSubmit={submit} className="card p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div>
          <div>
            <label className="label" htmlFor="to">To</label>
            <input id="to" type="email" className="input" placeholder="jane@company.com" value={form.to} onChange={set("to")} required />
          </div>
        </div>
        <div className="mt-4">
          <label className="label" htmlFor="subject">Subject</label>
          <input id="subject" className="input" placeholder="Quick question about…" value={form.subject} onChange={set("subject")} required />
        </div>
        <div className="mt-4">
          <label className="label" htmlFor="body">Body</label>
          <textarea
            id="body"
            className="input min-h-[260px] resize-y leading-relaxed"
            placeholder={"Hi Jane,\n\n…\n\nBest,\nSifat"}
            value={form.body}
            onChange={set("body")}
            required
          />
        </div>
        {plan && <FollowupPlanner plan={plan} setPlan={setPlan} defaults={defaults} />}
        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Eye className="h-3.5 w-3.5" />
            {localOnly
              ? "Open tracking uses localhost — set your ngrok URL in Settings so opens can be detected."
              : `Open tracking via ${settings?.backend_url || "…"}`}
          </p>
          <button className="btn-primary" disabled={sending}>
            {sending ? <Spinner className="h-4 w-4 !text-white" /> : <Send className="h-4 w-4" />}
            {sending ? "Sending…" : "Send email"}
          </button>
        </div>
      </motion.form>
    </>
  );
}
