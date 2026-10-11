import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Search, Users } from "lucide-react";
import PageHeader from "../components/PageHeader.jsx";
import LeadsTable from "../components/LeadsTable.jsx";
import LeadDrawer from "../components/LeadDrawer.jsx";
import EmptyState from "../components/EmptyState.jsx";
import Spinner from "../components/Spinner.jsx";
import { api } from "../lib/api.js";

const FILTERS = ["All", "Sent", "Replied", "Bounced", "Opened", "Pending Follow-up"];

function matches(l, filter) {
  switch (filter) {
    case "Sent": return l.status === "Sent";
    case "Replied": return l.replied;
    case "Bounced": return l.bounced;
    case "Opened": return l.opened;
    case "Pending Follow-up": return l.pending_followup;
    default: return true;
  }
}

export default function Leads() {
  const [leads, setLeads] = useState(null);
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [selectedLead, setSelectedLead] = useState(null);

  const loadLeads = useCallback(() => {
    api.leads().then(setLeads).catch((e) => toast.error(e.message));
  }, []);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  // Keep selectedLead in sync if leads update
  useEffect(() => {
    if (selectedLead && leads) {
      const refreshed = leads.find((l) => l.id === selectedLead.id);
      if (refreshed) setSelectedLead(refreshed);
    }
  }, [leads]); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(() => {
    if (!leads) return [];
    const q = search.trim().toLowerCase();
    return leads.filter(
      (l) => matches(l, filter) && (!q || l.name?.toLowerCase().includes(q) || l.email.toLowerCase().includes(q))
    );
  }, [leads, filter, search]);

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f, leads ? leads.filter((l) => matches(l, f)).length : 0])),
    [leads]
  );

  return (
    <>
      <PageHeader
        title="Leads"
        subtitle={leads ? `${leads.length} total · Click any lead to view full sent email history, follow-ups & opens` : ""}
      />
      <div className="card">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 dark:border-ink-700 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`chip ${
                  filter === f
                    ? "bg-accent-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-ink-850 dark:text-slate-400 dark:hover:bg-ink-800"
                }`}
              >
                {f} <span className="ml-1 opacity-70">{counts[f]}</span>
              </button>
            ))}
          </div>
          <div className="relative lg:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input !pl-9" placeholder="Search name or email" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        {!leads ? (
          <div className="flex justify-center py-16"><Spinner className="h-7 w-7" /></div>
        ) : visible.length ? (
          <LeadsTable leads={visible} onSelectLead={setSelectedLead} />
        ) : (
          <EmptyState
            icon={Users}
            title={leads.length ? "No leads match" : "No leads yet"}
            description={leads.length ? "Try a different filter or search term." : "Leads appear here after you send an email."}
          />
        )}
      </div>

      {selectedLead && (
        <LeadDrawer
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onUpdate={loadLeads}
        />
      )}
    </>
  );
}
