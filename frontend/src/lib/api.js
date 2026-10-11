export const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(/\/$/, "");

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new Error(`Cannot reach backend at ${API_URL}. Is uvicorn running?`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = Array.isArray(data.detail)
      ? data.detail.map((d) => `${d.loc?.slice(-1)[0]}: ${d.msg}`).join(", ")
      : data.detail;
    throw new Error(detail || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  authStatus: () => request("/api/auth/status"),
  startAuth: () => request("/api/auth/gmail", { method: "POST" }),
  logout: () => request("/api/auth/logout", { method: "POST" }),
  setupSheet: () => request("/api/setup/sheet"),
  stats: () => request("/api/stats"),
  leads: (status = "all", search = "") =>
    request(`/api/leads?status=${encodeURIComponent(status)}&search=${encodeURIComponent(search)}`),
  followups: () => request("/api/followups"),
  send: (body) => request("/api/send", { method: "POST", body }),
  sendFollowup: (body) => request("/api/followup/send", { method: "POST", body }),
  scheduleFollowup: (body) => request("/api/followup/schedule", { method: "POST", body }),
  deleteFollowup: (id) => request(`/api/followup/${id}`, { method: "DELETE" }),
  updateNotes: (id, notes) => request(`/api/leads/${id}/notes`, { method: "PATCH", body: { notes } }),
  settings: () => request("/api/settings"),
  saveSettings: (body) => request("/api/settings", { method: "POST", body }),
  sync: () => request("/api/sync"),
  notifications: () => request("/api/notifications"),
  markAllSeen: () => request("/api/notifications/seen", { method: "POST" }),
  inbox: ({ view = "replies", q = "", page = 0, pageToken = "" } = {}) =>
    request(
      `/api/inbox?view=${view}&q=${encodeURIComponent(q)}&page=${page}` +
        (pageToken ? `&page_token=${encodeURIComponent(pageToken)}` : "")
    ),
  thread: (id) => request(`/api/inbox/thread/${encodeURIComponent(id)}`),
  reply: (body) => request("/api/inbox/reply", { method: "POST", body }),
  inboxSend: (body) => request("/api/inbox/send", { method: "POST", body }),
  attachmentUrl: (messageId, a) =>
    `${API_URL}/api/inbox/attachment/${messageId}/${encodeURIComponent(a.attachment_id)}` +
    `?filename=${encodeURIComponent(a.filename)}&mime=${encodeURIComponent(a.mime)}`,
  leadHistory: (id) => request(`/api/leads/${id}/history`),
  campaigns: () => request("/api/campaigns"),
  createCampaign: (body) => request("/api/campaigns", { method: "POST", body }),
  templates: (category = "") => request(`/api/templates${category ? `?category=${encodeURIComponent(category)}` : ""}`),
  createTemplate: (body) => request("/api/templates", { method: "POST", body }),
  deleteTemplate: (id) => request(`/api/templates/${id}`, { method: "DELETE" }),
  suppressions: () => request("/api/suppressions"),
  addSuppression: (email, reason = "manual") =>
    request(`/api/suppressions?email=${encodeURIComponent(email)}&reason=${encodeURIComponent(reason)}`, { method: "POST" }),
  deleteSuppression: (id) => request(`/api/suppressions/${id}`, { method: "DELETE" }),
  syncLogs: (limit = 20) => request(`/api/sync/logs?limit=${limit}`),
  pushStatus: () => request("/api/push/status"),
  pushWatch: (topicName) => request("/api/push/watch", { method: "POST", body: { topic_name: topicName } }),
  pushStop: () => request("/api/push/stop", { method: "POST" }),
};
