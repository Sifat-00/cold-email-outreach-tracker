import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { motion } from "framer-motion";
import { CalendarDays, ExternalLink, FileSpreadsheet, Globe, LogOut, Mail, Plus, RefreshCw, Save, X, Zap, Bell } from "lucide-react";
import PageHeader from "../components/PageHeader.jsx";
import Spinner from "../components/Spinner.jsx";
import { api } from "../lib/api.js";

function Section({ icon: Icon, title, description, children, index = 0 }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="card p-6"
    >
      <div className="mb-4 flex items-start gap-3">
        <div className="rounded-xl bg-accent-500/10 p-2"><Icon className="h-5 w-5 text-accent-500" /></div>
        <div>
          <h2 className="font-semibold">{title}</h2>
          {description && <p className="text-sm text-slate-500 dark:text-slate-400">{description}</p>}
        </div>
      </div>
      {children}
    </motion.section>
  );
}

export default function Settings({ auth, onAuthChange }) {
  const [settings, setSettings] = useState(null);
  const [backendUrl, setBackendUrl] = useState("");
  const [days, setDays] = useState([3, 5, 7]);
  const [saving, setSaving] = useState(false);
  const [creatingSheet, setCreatingSheet] = useState(false);
  const [pushStatus, setPushStatus] = useState(null);
  const [topicName, setTopicName] = useState("");
  const [pushBusy, setPushBusy] = useState(false);

  const loadPush = () =>
    api.pushStatus().then((p) => {
      setPushStatus(p);
      setTopicName(p.topic || "");
      return p;
    }).catch(() => {});

  const load = () =>
    api.settings().then((s) => {
      setSettings(s);
      setBackendUrl(s.backend_url || "");
      setDays(s.followup_days ?? [3, 5, 7]);
      return s;
    }).catch((e) => toast.error(e.message));

  useEffect(() => { load(); loadPush(); }, []);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const s = await api.saveSettings({ backend_url: backendUrl, followup_days: days.map(Number) });
      setSettings(s);
      setDays(s.followup_days);
      toast.success("Settings saved");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const createSheet = async () => {
    setCreatingSheet(true);
    try {
      const r = await api.setupSheet();
      toast.success(r.created ? "Google Sheet created" : "Google Sheet is connected");
      load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setCreatingSheet(false);
    }
  };

  const disconnect = async () => {
    if (!confirm("Disconnect Gmail? You'll need to sign in again.")) return;
    await api.logout();
    toast.success("Gmail disconnected");
    onAuthChange();
  };

  const enablePush = async () => {
    if (!topicName.trim()) {
      toast.error("Enter your Pub/Sub topic name first");
      return;
    }
    setPushBusy(true);
    try {
      await api.pushWatch(topicName.trim());
      toast.success("Push notifications enabled — replies will be detected instantly");
      loadPush();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setPushBusy(false);
    }
  };

  const disablePush = async () => {
    setPushBusy(true);
    try {
      await api.pushStop();
      toast.success("Push notifications stopped");
      loadPush();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setPushBusy(false);
    }
  };

  if (!settings) return <div className="flex justify-center py-20"><Spinner className="h-8 w-8" /></div>;

  return (
    <>
      <PageHeader title="Settings" subtitle="All dates and times use Asia/Dhaka." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Section icon={Mail} title="Gmail account" description="Emails are sent from this account." index={0}>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-100 px-4 py-3 dark:bg-ink-850">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-sm font-medium">{auth.email || "Connected"}</span>
            </div>
            <button className="btn-ghost !py-1.5 text-xs" onClick={disconnect}><LogOut className="h-3.5 w-3.5" /> Disconnect</button>
          </div>
        </Section>

        <Section icon={FileSpreadsheet} title="Google Sheet" description='Auto-created in your Drive as "Cold Email Tracker".' index={1}>
          {settings.sheet_url ? (
            <a href={settings.sheet_url} target="_blank" rel="noreferrer" className="btn-primary w-full">
              <ExternalLink className="h-4 w-4" /> Open Google Sheet
            </a>
          ) : (
            <button onClick={createSheet} disabled={creatingSheet} className="btn-primary w-full">
              {creatingSheet ? <Spinner className="h-4 w-4 !text-white" /> : <RefreshCw className="h-4 w-4" />} Create Google Sheet
            </button>
          )}
          {settings.sheet_url && (
            <p className="mt-3 break-all text-xs text-slate-500 dark:text-slate-400">{settings.sheet_url}</p>
          )}
        </Section>

        <Section icon={Zap} title="Instant reply detection" description="Get notified the moment a lead replies or an email bounces — no polling delay." index={2}>
          {pushStatus?.active ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 px-4 py-3">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Active — watching for new emails</span>
              </div>
              <p className="break-all text-xs text-slate-500 dark:text-slate-400">Topic: {pushStatus.topic}</p>
              <button className="btn-ghost w-full" disabled={pushBusy} onClick={disablePush}>
                {pushBusy ? <Spinner className="h-4 w-4" /> : <Bell className="h-4 w-4" />} Stop push notifications
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Enter the Pub/Sub topic name you created in Google Cloud (e.g. <code className="rounded bg-slate-100 px-1 dark:bg-ink-800">projects/your-project/topics/gmail-replies</code>)
              </p>
              <input
                className="input"
                value={topicName}
                onChange={(e) => setTopicName(e.target.value)}
                placeholder="projects/your-project-id/topics/gmail-replies"
              />
              <button className="btn-primary w-full" disabled={pushBusy || !topicName.trim()} onClick={enablePush}>
                {pushBusy ? <Spinner className="h-4 w-4 !text-white" /> : <Zap className="h-4 w-4" />} Enable instant detection
              </button>
            </div>
          )}
        </Section>

        <form onSubmit={save} className="contents">
          <Section icon={Globe} title="Backend URL (open tracking)" description="Public URL used in the tracking pixel. Paste your ngrok HTTPS URL here." index={3}>
            <label className="label" htmlFor="backend">Backend URL</label>
            <input id="backend" className="input" value={backendUrl} onChange={(e) => setBackendUrl(e.target.value)} placeholder="https://xxxx.ngrok-free.app" />
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Default http://localhost:8000 only works on this computer — recipients can't load it, so opens won't register. Run <code className="rounded bg-slate-100 px-1 dark:bg-ink-800">ngrok http 8000</code> and paste the URL. Applies to emails sent after saving.
            </p>
            <button className="btn-primary mt-4" disabled={saving}>{saving ? <Spinner className="h-4 w-4 !text-white" /> : <Save className="h-4 w-4" />} Save</button>
          </Section>

          <Section icon={CalendarDays} title="Default follow-up schedule" description="The default follow-ups for every new email, counted in days after sending (Asia/Dhaka). You can change them for a single email on the Compose page." index={4}>
            {days.length === 0 && (
              <p className="mb-3 rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-500 dark:bg-ink-850 dark:text-slate-400">No automatic follow-ups. You can still add them per lead on the Follow-ups page.</p>
            )}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {days.map((d, i) => (
                <div key={i}>
                  <label className="label" htmlFor={`fu${i}`}>Follow-up {i + 1}</label>
                  <div className="relative">
                    <input
                      id={`fu${i}`} type="number" min={1} max={365} className="input pr-16" value={d}
                      onChange={(e) => setDays((arr) => arr.map((x, j) => (j === i ? e.target.value : x)))}
                      required
                    />
                    <span className="pointer-events-none absolute right-9 top-1/2 -translate-y-1/2 text-xs text-slate-400">days</span>
                    <button
                      type="button"
                      onClick={() => setDays((arr) => arr.filter((_, j) => j !== i))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-rose-500/10 hover:text-rose-500"
                      aria-label={`Remove follow-up ${i + 1}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-ghost"
                disabled={days.length >= 20}
                onClick={() => setDays((arr) => [...arr, (Number(arr[arr.length - 1]) || 0) + 3])}
              >
                <Plus className="h-4 w-4" /> Add follow-up
              </button>
              <button className="btn-primary" disabled={saving}>{saving ? <Spinner className="h-4 w-4 !text-white" /> : <Save className="h-4 w-4" />} Save</button>
            </div>
          </Section>
        </form>
      </div>
    </>
  );
}
