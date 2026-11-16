import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { mix, lines, key } from './mix.js';

const api = async (path, body, method = 'PUT') => {
  const r = await fetch('/api' + path, body && { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || `Request failed (${r.status})`), { status: r.status });
  return data;
};

const build = p => mix(p.niche.trim() || 'my niche', lines(p.subs), lines(p.formats), lines(p.angles));

function Auth({ onAuthed }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async e => {
    e.preventDefault();
    setBusy(true);
    try { onAuthed(await api('/' + mode, { email, password }, 'POST')); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return (
    <form className="auth" onSubmit={submit}>
      <h1>Content Planner</h1>
      <h2>{mode === 'login' ? 'Log in' : 'Sign up'}</h2>
      <label htmlFor="email">Email</label>
      <input id="email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
      <label htmlFor="password">Password <small>(at least 8 characters)</small></label>
      <input id="password" type="password" minLength={8} required value={password} onChange={e => setPassword(e.target.value)}
        autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
      {error && <p role="alert" style={{ color: 'crimson' }}>{error}</p>}
      <div className="bar">
        <button className="primary" disabled={busy}>{mode === 'login' ? 'Log in' : 'Create account'}</button>
        <button type="button" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}>
          {mode === 'login' ? 'No account? Sign up' : 'Have an account? Log in'}
        </button>
      </div>
    </form>
  );
}

function Root() {
  const [user, setUser] = useState(undefined); // undefined = checking, null = logged out
  useEffect(() => { api('/me').then(setUser).catch(() => setUser(null)); }, []);
  if (user === undefined) return <p>Loading…</p>;
  if (!user) return <Auth onAuthed={setUser} />;
  return <App user={user} onLogout={() => api('/logout', {}, 'POST').finally(() => setUser(null))} onExpired={() => setUser(null)} />;
}

function App({ user, onLogout, onExpired }) {
  const [inputs, setInputs] = useState(null);
  const [combos, setCombos] = useState([]);
  const [done, setDone] = useState(new Set());
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const fail = e => (e.status === 401 ? onExpired() : setError(e.message));

  useEffect(() => {
    api('/plan').then(p => {
      setInputs({ niche: p.niche, subs: p.subs, formats: p.formats, angles: p.angles });
      setDone(new Set(p.done.map(key)));
      setCombos(build(p));
    }).catch(fail);
  }, []);

  if (error && !inputs) return <p>Could not load: {error}. Is the server running?</p>;
  if (!inputs) return <p>Loading…</p>;

  const mixNow = () => {
    setCombos(build(inputs));
    api('/plan', inputs).then(() => setError('')).catch(fail);
  };

  const shuffle = () => {
    const a = [...combos];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    setCombos(a);
  };

  const toggle = (c, checked) => {
    const next = new Set(done);
    checked ? next.add(key(c)) : next.delete(key(c));
    setDone(next);
    api('/done', { sub: c.sub, format: c.format, angle: c.angle, done: checked })
      .then(() => setError(''))
      .catch(e => { fail(e); setDone(done); }); // roll back the tick if it didn't save
  };

  const downloadCsv = () => {
    const cell = v => `"${String(v).replace(/"/g, '""')}"`;
    const rows = [['Sub-niche', 'Format', 'Angle', 'Brief', 'Done'], ...combos.map(c => [c.sub, c.format, c.angle, c.brief, done.has(key(c)) ? 'yes' : ''])];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([rows.map(r => r.map(cell).join(',')).join('\n')], { type: 'text/csv' }));
    a.download = 'content-ideas.csv';
    a.click();
  };

  const q = filter.toLowerCase();
  const shown = combos.filter(c => !q || c.brief.toLowerCase().includes(q));
  const nDone = combos.filter(c => done.has(key(c))).length;
  const field = (name, label, placeholder) => (
    <div>
      <label htmlFor={name}>{label} <small>(one per line)</small></label>
      <textarea id={name} placeholder={placeholder} value={inputs[name]} onChange={e => setInputs({ ...inputs, [name]: e.target.value })} />
    </div>
  );

  return (
    <>
      <div className="bar" style={{ justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0 }}>Content Planner</h1>
        <span>{user.email} <button onClick={onLogout}>Log out</button></span>
      </div>
      <div className="grid">
        <div>
          <label htmlFor="niche">Main niche</label>
          <input id="niche" placeholder="e.g. Building on socials" value={inputs.niche} onChange={e => setInputs({ ...inputs, niche: e.target.value })} />
        </div>
      </div>
      <div className="grid" style={{ marginTop: 12 }}>
        {field('subs', 'Sub-niches', 'e.g.\nMindset\nProduct optimisation\nLife automation')}
        {field('formats', 'Engaging formats')}
        {field('angles', 'Video angles')}
      </div>

      <div className="bar">
        <button className="primary" onClick={mixNow}>Mix them</button>
        <button onClick={shuffle}>Shuffle</button>
        <button onClick={() => setCombos(build(inputs))}>Original order</button>
        <button onClick={downloadCsv}>Download CSV</button>
        <input placeholder="Filter…" value={filter} onChange={e => setFilter(e.target.value)} />
        <span id="count">{shown.length} of {combos.length} ideas · {nDone} done</span>
      </div>
      {error && <p role="alert" style={{ color: 'crimson' }}>{error}</p>}
      {combos.length === 0 && <p>Add your niche and at least one sub-niche, format and angle, then click <b>Mix them</b>.</p>}

      <div className="wrap"><table>
        <thead><tr><th>Done</th><th>#</th><th>Sub-niche</th><th>Format</th><th>Angle</th><th>Brief</th></tr></thead>
        <tbody>
          {shown.map((c, i) => {
            const isDone = done.has(key(c));
            return (
              <tr key={key(c)} className={isDone ? 'done' : ''}>
                <td><input type="checkbox" aria-label="Mark done" checked={isDone} onChange={e => toggle(c, e.target.checked)} /></td>
                <td>{i + 1}</td><td>{c.sub}</td><td>{c.format}</td><td>{c.angle}</td><td>{c.brief}</td>
              </tr>
            );
          })}
        </tbody>
      </table></div>
    </>
  );
}

createRoot(document.getElementById('root')).render(<Root />);
