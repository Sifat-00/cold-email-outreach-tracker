import { motion } from "framer-motion";

const TONES = {
  violet: "from-accent-500/20 to-accent-500/5 text-accent-500",
  emerald: "from-emerald-500/20 to-emerald-500/5 text-emerald-500",
  rose: "from-rose-500/20 to-rose-500/5 text-rose-500",
  sky: "from-sky-500/20 to-sky-500/5 text-sky-500",
  amber: "from-amber-500/20 to-amber-500/5 text-amber-500",
  indigo: "from-indigo-500/20 to-indigo-500/5 text-indigo-400",
};

export default function StatsCard({ label, value, icon: Icon, tone = "violet", suffix = "", index = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.25 }}
      whileHover={{ y: -2 }}
      className="card p-5"
    >
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
        <div className={`rounded-xl bg-gradient-to-br p-2 ${TONES[tone]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-3 text-3xl font-bold tracking-tight">
        {value}
        {suffix && <span className="ml-0.5 text-lg font-semibold text-slate-400">{suffix}</span>}
      </p>
    </motion.div>
  );
}
