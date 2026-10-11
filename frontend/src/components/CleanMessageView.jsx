import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { splitEmailReply } from "../lib/format.js";

export default function CleanMessageView({ content, className = "" }) {
  const [showQuote, setShowQuote] = useState(false);
  const { reply, quote, hasQuote } = splitEmailReply(content);

  if (!content) return null;

  return (
    <div className={`text-xs ${className}`}>
      {/* The client's actual new reply */}
      <div className="font-sans text-sm font-medium leading-relaxed text-slate-800 dark:text-slate-100 whitespace-pre-wrap">
        {reply || content}
      </div>

      {/* Quoted email chain tucked into a collapsible toggle */}
      {hasQuote && quote && (
        <div className="mt-2.5">
          <button
            type="button"
            onClick={() => setShowQuote(!showQuote)}
            className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-500 transition hover:bg-slate-200 hover:text-slate-700 dark:bg-ink-800 dark:text-slate-400 dark:hover:bg-ink-700 dark:hover:text-slate-200"
            title="Toggle quoted previous conversation"
          >
            <span className="font-mono text-xs leading-none">···</span>
            <span>{showQuote ? "Hide quoted message" : "Show quoted email"}</span>
          </button>

          {showQuote && (
            <div className="mt-2 rounded-r-lg border-l-2 border-slate-300 bg-slate-50/70 p-2.5 font-sans text-xs leading-relaxed text-slate-500 whitespace-pre-wrap dark:border-ink-700 dark:bg-ink-900/60 dark:text-slate-400">
              {quote}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
