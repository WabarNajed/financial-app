'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store-context';
import { Header, Footer, Toast } from '../components';

export default function AuthPage() {
  const router = useRouter();
  const { login, register } = useStore();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', city: '', address: '' });
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type?: string } | null>(null);

  const update = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setLoading(true);
    try {
      if (mode === 'login') { await login(form.email, form.password); }
      else { await register(form); }
      router.push('/account');
    } catch (e: any) { setToast({ msg: e.message, type: 'error' }); }
    setLoading(false);
  };

  return (
    <>
      <Header />
      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
      <div className="container-sm" style={{ padding: '60px 20px', minHeight: '60vh' }}>
        <div style={{ maxWidth: 440, margin: '0 auto' }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8, textAlign: 'center' }}>{mode === 'login' ? 'Login' : 'Create Account'}</h1>
          <p style={{ textAlign: 'center', color: 'var(--text2)', marginBottom: 32 }}>
            {mode === 'login' ? 'Sign in to your account' : 'Register for a new account'}
          </p>

          <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
            <button className={`btn btn-full ${mode === 'login' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setMode('login')}>Login</button>
            <button className={`btn btn-full ${mode === 'register' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setMode('register')}>Register</button>
          </div>

          {mode === 'register' && <div className="field"><label>Full Name</label><input value={form.name} onChange={(e) => update('name', e.target.value)} /></div>}
          <div className="field"><label>Email</label><input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} /></div>
          <div className="field"><label>Password</label><input type="password" value={form.password} onChange={(e) => update('password', e.target.value)} /></div>
          {mode === 'register' && (
            <>
              <div className="field"><label>Phone</label><input value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="+966..." /></div>
              <div className="field"><label>City</label><input value={form.city} onChange={(e) => update('city', e.target.value)} /></div>
            </>
          )}

          <button className="btn btn-primary btn-lg btn-full" onClick={submit} disabled={loading} style={{ marginTop: 8 }}>
            {loading ? 'Please wait...' : (mode === 'login' ? 'Login' : 'Create Account')}
          </button>
        </div>
      </div>
      <Footer />
    </>
  );
}
