import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Lock, Send, X } from "lucide-react";
import Spinner from "./Spinner.jsx";

export default function FollowupModal({ lead, onClose, onSend }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (lead) {
      setSubject(lead.subject?.toLowerCase().startsWith("re:") ? lead.subject : `Re: ${lead.subject}`);
      setBody(`Hi ${lead.name},\n\nJust following up on my previous email — `);
    }
  }, [lead]);

  const submit = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      await onSend({ lead_id: lead.id, subject, body });
    } finally {
      setSending(false);
    }
  };

  return (
    <AnimatePresence>
      {lead && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.form
            onSubmit={submit}
            onClick={(e) => e.stopPropagation()}
            initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }}
            className="card w-full max-w-xl rounded-b-none p-6 sm:rounded-2xl"
          >
            <div className="mb-5 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold">Send follow-up #{lead.next_followup_number}</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">To {lead.name} &lt;{lead.email}&gt; · same Gmail thread</p>
              </div>
              <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-ink-800"><X className="h-5 w-5" /></button>
            </div>

            <div className="mb-4">
              <div className="mb-1.5 flex items-center justify-between">
                <label className="label !mb-0">Subject</label>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 dark:text-slate-500">
                  <Lock className="h-3 w-3" /> Locked to preserve Gmail thread
                </span>
              </div>
              <div className="relative">
                <input
                  className="input !bg-slate-100/75 !pr-9 font-medium text-slate-700 cursor-not-allowed select-none dark:!bg-ink-850 dark:text-slate-300"
                  value={subject}
                  readOnly
                  title="Subject is locked to ensure Gmail threads this follow-up into the original email"
                />
                <Lock className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>
            </div>

            <label className="label">Message</label>
            <textarea className="input min-h-[180px] resize-y" value={body} onChange={(e) => setBody(e.target.value)} required />
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn-primary" disabled={sending || !body.trim()}>
                {sending ? <Spinner className="h-4 w-4 !text-white" /> : <Send className="h-4 w-4" />}
                Send follow-up
              </button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
