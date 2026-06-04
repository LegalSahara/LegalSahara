// ─── API layer ────────────────────────────────────────────────────────────────
const API_BASE = process.env.REACT_APP_API_URL || '';

export const api = {
  setToken(t)  { localStorage.setItem('ls_token', t); },
  getToken()   { return localStorage.getItem('ls_token'); },
  clearToken() { localStorage.removeItem('ls_token'); },
  getAuthHeaders() {
    const t = this.getToken();
    return { Authorization: t ? `Bearer ${t}` : '' };
  },
  async login(email, password) {
    const form = new FormData();
    form.append('email', email); form.append('password', password);
    const res = await fetch(`${API_BASE}/auth/login`, { method: 'POST', body: form });
    const data = await res.json();
    if (data.status === 'ok') this.setToken(data.access_token);
    return data;
  },
  async signup(email, password, fullName) {
    const form = new FormData();
    form.append('email', email); form.append('password', password); form.append('full_name', fullName);
    const res = await fetch(`${API_BASE}/auth/signup`, { method: 'POST', body: form });
    const data = await res.json();
    if (data.status === 'ok') this.setToken(data.access_token);
    return data;
  },
  async verifyToken() {
    const res = await fetch(`${API_BASE}/auth/verify`, { headers: this.getAuthHeaders() });
    return res.json();
  },
  async draft(story) {
    const form = new FormData();
    form.append('story', story); form.append('user_id', 'web_user');
    const res = await fetch(`${API_BASE}/draft`, { method: 'POST', body: form, headers: this.getAuthHeaders() });
    return res.json();
  },
  async rag(query) {
    const form = new FormData();
    form.append('query', query);
    const res = await fetch(`${API_BASE}/rag`, { method: 'POST', body: form, headers: this.getAuthHeaders() });
    return res.json();
  },
  async summarize(file) {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${API_BASE}/summarize`, { method: 'POST', body: form, headers: this.getAuthHeaders() });
    return res.json();
  },
  async draftPdf(petitionText) {
    const form = new FormData();
    form.append('petition_text', petitionText);
    const res = await fetch(`${API_BASE}/draft/pdf`, { method: 'POST', body: form, headers: this.getAuthHeaders() });
    if (!res.ok) throw new Error(`PDF error ${res.status}`);
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },
  async health() {
    try { return (await fetch(`${API_BASE}/health`)).ok; } catch { return false; }
  },
  async getSessions() {
    const res = await fetch(`${API_BASE}/sessions`, { headers: this.getAuthHeaders() });
    return res.json();
  },
  async createSession(feature, label, data) {
    const form = new FormData();
    form.append('feature', feature);
    form.append('label', label);
    form.append('data', JSON.stringify(data));
    const res = await fetch(`${API_BASE}/sessions`, { method: 'POST', body: form, headers: this.getAuthHeaders() });
    return res.json();
  },
  async updateSession(id, changes) {
    const form = new FormData();
    if (changes.label !== undefined) form.append('label', changes.label);
    if (changes.data  !== undefined) form.append('data',  JSON.stringify(changes.data));
    const res = await fetch(`${API_BASE}/sessions/${id}`, { method: 'PATCH', body: form, headers: this.getAuthHeaders() });
    return res.json();
  },
  async deleteSession(id) {
    const res = await fetch(`${API_BASE}/sessions/${id}`, { method: 'DELETE', headers: this.getAuthHeaders() });
    return res.json();
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function downloadTxt(text, filename = 'petition.txt') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  a.download = filename; a.click();
}

export function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleString('en-PK', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
