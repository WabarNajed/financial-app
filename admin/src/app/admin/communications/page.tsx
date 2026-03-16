'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

function Toast({ msg, type, onDone }: { msg: string; type: string; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, [onDone]);
  return <div className={`toast toast-${type}`}>{msg}</div>;
}

export default function CommunicationsPage() {
  const [tab, setTab] = useState<'emails' | 'compose' | 'templates'>('emails');
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);
  const notify = (msg: string, type = 'success') => setToast({ msg, type });

  return (
    <div>
      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
      <div className="page-header">
        <h1>Communications</h1>
        <p>Emails, templates, and messaging</p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(['emails', 'compose', 'templates'] as const).map((t) => (
          <button key={t} className={`btn ${tab === t ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab(t)} style={{ textTransform: 'capitalize' }}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'emails' && <EmailList notify={notify} />}
      {tab === 'compose' && <ComposeEmail notify={notify} />}
      {tab === 'templates' && <TemplatesList notify={notify} />}
    </div>
  );
}

function EmailList({ notify }: { notify: (m: string, t?: string) => void }) {
  const [emails, setEmails] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    api.getEmails(filter ? { direction: filter } : {}).then((r) => setEmails(r.emails || r.data || [])).catch((e) => notify(e.message, 'error')).finally(() => setLoading(false));
  }, [filter]);

  if (loading) return <div style={{ color: 'var(--text2)', padding: 20 }}>Loading...</div>;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['', 'outbound', 'inbound'].map((f) => (
          <button key={f} className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-outline'}`} onClick={() => { setFilter(f); setLoading(true); }}>
            {f || 'All'}
          </button>
        ))}
      </div>
      <div className="card">
        <table>
          <thead><tr><th>Direction</th><th>From</th><th>To</th><th>Subject</th><th>Order</th><th>Date</th></tr></thead>
          <tbody>
            {emails.map((e: any, i: number) => (
              <tr key={e.id || i}>
                <td><span style={{ color: e.direction === 'outbound' ? 'var(--accent2)' : 'var(--green)' }}>{e.direction}</span></td>
                <td style={{ fontSize: 12 }}>{e.from_address || '—'}</td>
                <td style={{ fontSize: 12 }}>{e.to_address || '—'}</td>
                <td style={{ fontWeight: 500 }}>{e.subject || '(no subject)'}</td>
                <td style={{ fontSize: 12 }}>{e.order_id || '—'}</td>
                <td style={{ fontSize: 12, color: 'var(--text2)' }}>{e.created_at ? new Date(e.created_at).toLocaleString() : '—'}</td>
              </tr>
            ))}
            {emails.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text2)', padding: 30 }}>No emails found</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ComposeEmail({ notify }: { notify: (m: string, t?: string) => void }) {
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [sending, setSending] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);

  useEffect(() => { api.getTemplates().then((r) => setTemplates(r.templates || r.data || [])).catch(() => {}); }, []);

  const send = async () => {
    if (!to || !subject) { notify('Fill required fields', 'error'); return; }
    setSending(true);
    try {
      await api.sendEmail(templateName ? { to, subject, template_name: templateName, body } : { to, subject, body });
      notify('Email sent');
      setTo(''); setSubject(''); setBody('');
    } catch (e: any) { notify(e.message, 'error'); }
    setSending(false);
  };

  return (
    <div className="card">
      <h3 style={{ marginBottom: 16 }}>Compose Email</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="field"><label>To</label><input value={to} onChange={(e) => setTo(e.target.value)} placeholder="recipient@email.com" /></div>
        <div className="field">
          <label>Template (optional)</label>
          <select value={templateName} onChange={(e) => setTemplateName(e.target.value)} style={{ padding: '8px 12px', borderRadius: 6, background: 'var(--card)', color: 'var(--text)', border: '1px solid var(--border)', width: '100%' }}>
            <option value="">None (plain text)</option>
            {templates.map((t: any) => <option key={t.id || t.name} value={t.name}>{t.name}</option>)}
          </select>
        </div>
      </div>
      <div className="field"><label>Subject</label><input value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
      <div className="field"><label>Body</label><textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Email content..." /></div>
      <button className="btn btn-primary" onClick={send} disabled={sending}>{sending ? 'Sending...' : 'Send Email'}</button>
    </div>
  );
}

function TemplatesList({ notify }: { notify: (m: string, t?: string) => void }) {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<any>({ name: '', subject: '', body: '', type: 'order' });
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<any>(null);

  const load = () => { api.getTemplates().then((r) => setTemplates(r.templates || r.data || [])).catch(() => {}).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.name || !form.subject || !form.body) { notify('Fill all fields', 'error'); return; }
    setSaving(true);
    try { await api.saveTemplate(form); notify('Template saved'); load(); setForm({ name: '', subject: '', body: '', type: 'order' }); } catch (e: any) { notify(e.message, 'error'); }
    setSaving(false);
  };
  const seed = async () => {
    try { await api.seedTemplates(); notify('Default templates seeded'); load(); } catch (e: any) { notify(e.message, 'error'); }
  };
  const doPreview = async (name: string) => {
    try { const r = await api.previewTemplate({ template_name: name, data: { customer_name: 'Test Customer', order_id: '1234', tracking_number: 'TRACK123' } }); setPreview(r); } catch (e: any) { notify(e.message, 'error'); }
  };

  if (loading) return <div style={{ color: 'var(--text2)', padding: 20 }}>Loading...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3>Email Templates ({templates.length})</h3>
        <button className="btn btn-outline btn-sm" onClick={seed}>Seed Defaults</button>
      </div>
      {templates.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <table>
            <thead><tr><th>Name</th><th>Subject</th><th>Type</th><th>Actions</th></tr></thead>
            <tbody>
              {templates.map((t: any) => (
                <tr key={t.id || t.name}>
                  <td style={{ fontWeight: 500 }}>{t.name}</td>
                  <td style={{ fontSize: 12 }}>{t.subject}</td>
                  <td style={{ fontSize: 12, color: 'var(--text2)' }}>{t.type || '—'}</td>
                  <td>
                    <button className="btn btn-sm btn-outline" onClick={() => doPreview(t.name)}>Preview</button>
                    <button className="btn btn-sm btn-outline" onClick={() => setForm({ name: t.name, subject: t.subject, body: t.body, type: t.type || 'order' })} style={{ marginLeft: 4 }}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {preview && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h4>Template Preview</h4>
          <div style={{ padding: 12, background: 'var(--bg)', borderRadius: 8, marginTop: 8 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{preview.subject}</div>
            <div style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{preview.body || preview.html}</div>
          </div>
          <button className="btn btn-sm btn-outline" onClick={() => setPreview(null)} style={{ marginTop: 8 }}>Close</button>
        </div>
      )}
      <div className="card" style={{ background: 'var(--bg)' }}>
        <h4 style={{ marginBottom: 12 }}>{form.name ? 'Edit Template' : 'New Template'}</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="field"><label>Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="template_name" /></div>
          <div className="field"><label>Type</label><input value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} placeholder="order, support, etc." /></div>
        </div>
        <div className="field"><label>Subject</label><input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Email subject with {placeholders}" /></div>
        <div className="field"><label>Body</label><textarea rows={8} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Email body with {customer_name}, {order_id}, etc." /></div>
        <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Template'}</button>
      </div>
    </div>
  );
}
