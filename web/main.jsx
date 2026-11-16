import { useEffect, useRef, useState } from 'react';
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

// Hash routes (#/, #/library, #/projects/:id) so Back/refresh work without a router or server changes
const useRoute = () => {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  const m = hash.match(/^#\/projects\/(\d+)$/);
  if (m) return { page: 'project', id: Number(m[1]) };
  return { page: hash === '#/library' ? 'library' : 'projects' };
};

function App({ user, onLogout, onExpired }) {
  const route = useRoute();
  const isAdmin = user.role === 'admin';
  return (
    <>
      <div className="bar" style={{ justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0 }}><a href="#/" className="home">Content Planner</a></h1>
        <nav className="bar" style={{ margin: 0 }}>
          <a href="#/">Projects</a>
          <a href="#/library">Formats &amp; angles</a>
          <span>{user.email}{isAdmin && <small> (admin)</small>}</span>
          <button onClick={onLogout}>Log out</button>
        </nav>
      </div>
      {route.page === 'project' && <Planner key={route.id} projectId={route.id} isAdmin={isAdmin} fail={e => (e.status === 401 ? onExpired() : null)} />}
      {route.page === 'library' && <Library isAdmin={isAdmin} onExpired={onExpired} />}
      {route.page === 'projects' && <Projects onExpired={onExpired} />}
    </>
  );
}

const KIND_LABEL = { format: 'Engaging formats', angle: 'Video angles' };

function useGuides(onError) {
  const [guides, setGuides] = useState(null);
  const load = () => api('/guides').then(setGuides).catch(onError);
  useEffect(() => { load(); }, []);
  return [guides, load];
}

function Library({ isAdmin, onExpired }) {
  const [error, setError] = useState('');
  const fail = e => (e.status === 401 ? onExpired() : setError(e.message));
  const [guides, reload] = useGuides(fail);
  const [open, setOpen] = useState(null);
  if (!guides) return error ? <p role="alert" style={{ color: 'crimson' }}>{error}</p> : <p>Loading…</p>;

  return (
    <>
      <h2>Formats &amp; angles</h2>
      <p><small>{isAdmin ? 'You are an admin: click any item to edit it, or add new ones.' : 'Click any item to see how to use it. Admins curate this list.'}</small></p>
      {error && <p role="alert" style={{ color: 'crimson' }}>{error}</p>}
      <div className="grid">
        {Object.keys(KIND_LABEL).map(kind => (
          <div key={kind}>
            <h3>{KIND_LABEL[kind]}</h3>
            <ul className="projects">
              {guides.filter(g => g.kind === kind).map(g => (
                <li key={g.id}><button className="link" onClick={() => setOpen(g)}>{g.name}</button></li>
              ))}
            </ul>
            {isAdmin && <button onClick={() => setOpen({ kind, name: '', description: '', steps: '', examples: '', hooks: '' })}>+ Add {kind}</button>}
          </div>
        ))}
      </div>
      {open && <GuideModal guide={open} isAdmin={isAdmin} fail={fail} onChanged={reload} onClose={() => setOpen(null)} />}
    </>
  );
}

const listOf = text => (text ?? '').split('\n').map(s => s.trim()).filter(Boolean);

function GuideModal({ guide, isAdmin, fail, onChanged, onClose }) {
  const isNew = !guide.id;
  const [editing, setEditing] = useState(isNew);
  const [form, setForm] = useState(guide);
  const [error, setError] = useState('');
  const set = k => e => setForm({ ...form, [k]: e.target.value });

  const save = e => {
    e.preventDefault();
    const req = isNew ? api('/guides', form, 'POST') : api('/guides/' + guide.id, form);
    req.then(() => { onChanged?.(); onClose(); }).catch(e => (e.status === 401 ? fail(e) : setError(e.message)));
  };
  const remove = () => {
    if (!confirm(`Delete "${guide.name}" from the library? Projects that use it keep the name.`)) return;
    api('/guides/' + guide.id, {}, 'DELETE').then(() => { onChanged?.(); onClose(); }).catch(e => (e.status === 401 ? fail(e) : setError(e.message)));
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="editor" role="dialog" aria-modal="true" aria-labelledby="g-title" onClick={e => e.stopPropagation()}
        onKeyDown={e => e.key === 'Escape' && onClose()} style={{ overflowY: 'auto' }}>
        <div className="bar" style={{ justifyContent: 'space-between', marginTop: 0 }}>
          <h2 id="g-title" style={{ margin: 0, fontSize: 18 }}>
            <small>{guide.kind === 'format' ? 'Format' : 'Angle'}</small><br />{isNew ? 'New ' + guide.kind : guide.name}
          </h2>
          <span>
            {isAdmin && !editing && <button onClick={() => setEditing(true)}>Edit</button>}{' '}
            <button onClick={onClose} autoFocus={!editing}>Close</button>
          </span>
        </div>

        {!editing ? (
          <div className="guide">
            {guide.description ? <p>{guide.description}</p> : <p><small>No description yet.</small></p>}
            {listOf(guide.steps).length > 0 && <><h3>Step by step</h3><ol>{listOf(guide.steps).map((s, i) => <li key={i}>{s}</li>)}</ol></>}
            {listOf(guide.hooks).length > 0 && <><h3>Hooks</h3><ul>{listOf(guide.hooks).map((s, i) => <li key={i}>{s}</li>)}</ul></>}
            {listOf(guide.examples).length > 0 && <><h3>Video examples</h3><ul>
              {listOf(guide.examples).filter(u => /^https?:\/\//i.test(u)).map((u, i) => <li key={i}><a href={u} target="_blank" rel="noopener noreferrer">{u}</a></li>)}
            </ul></>}
          </div>
        ) : (
          <form onSubmit={save} className="guide-form">
            <label htmlFor="g-name">Name</label>
            <input id="g-name" required value={form.name} onChange={set('name')} autoFocus />
            <label htmlFor="g-desc">Description</label>
            <textarea id="g-desc" value={form.description} onChange={set('description')} style={{ height: 80 }} />
            <label htmlFor="g-steps">Step by step <small>(one per line)</small></label>
            <textarea id="g-steps" value={form.steps} onChange={set('steps')} />
            <label htmlFor="g-hooks">Hooks <small>(one per line)</small></label>
            <textarea id="g-hooks" value={form.hooks} onChange={set('hooks')} style={{ height: 100 }} />
            <label htmlFor="g-ex">Video examples <small>(one link per line, starting with https://)</small></label>
            <textarea id="g-ex" value={form.examples} onChange={set('examples')} style={{ height: 80 }} />
            {error && <p role="alert" style={{ color: 'crimson' }}>{error}</p>}
            <div className="bar">
              <button className="primary">Save</button>
              {!isNew && <button type="button" onClick={remove}>Delete</button>}
              <button type="button" onClick={() => (isNew ? onClose() : (setEditing(false), setForm(guide)))}>Cancel</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// Checkbox list of library items; selected names not in the library (older projects) are kept and shown too
function Picker({ kind, guides, value, onChange, onInfo }) {
  const selected = lines(value);
  const names = guides.filter(g => g.kind === kind).map(g => g.name);
  const all = [...names, ...selected.filter(n => !names.includes(n))];
  const toggle = (name, on) => onChange(all.filter(n => (n === name ? on : selected.includes(n))).join('\n'));
  return (
    <fieldset className="picker">
      <legend>{KIND_LABEL[kind]}</legend>
      {all.map(n => (
        <div key={n} className="pick">
          <label><input type="checkbox" checked={selected.includes(n)} onChange={e => toggle(n, e.target.checked)} /> {n}</label>
          <button type="button" className="info" aria-label={`About ${n}`} onClick={() => onInfo(kind, n)}>ⓘ</button>
        </div>
      ))}
    </fieldset>
  );
}

function Projects({ onExpired }) {
  const [projects, setProjects] = useState(null);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');
  const fail = e => (e.status === 401 ? onExpired() : setError(e.message));

  useEffect(() => { api('/projects').then(setProjects).catch(fail); }, []);

  if (!projects) return error ? <p role="alert" style={{ color: 'crimson' }}>Could not load: {error}</p> : <p>Loading…</p>;

  const create = e => {
    e.preventDefault();
    if (!newName.trim()) return;
    api('/projects', { name: newName }, 'POST').then(p => { location.hash = `#/projects/${p.id}`; }).catch(fail);
  };

  const remove = p => {
    if (!confirm(`Delete project "${p.name}" and all its notes and ticks? This can't be undone.`)) return;
    api('/projects/' + p.id, {}, 'DELETE').then(() => { setProjects(projects.filter(x => x.id !== p.id)); setError(''); }).catch(fail);
  };

  return (
    <>
      <h2>Projects</h2>
      <form className="bar" onSubmit={create}>
        <input placeholder="New project name" value={newName} onChange={e => setNewName(e.target.value)} aria-label="New project name" />
        <button className="primary">+ Create project</button>
      </form>
      {error && <p role="alert" style={{ color: 'crimson' }}>{error}</p>}
      {projects.length === 0 && <p>No projects yet. Create one above.</p>}
      <ul className="projects">
        {projects.map(p => (
          <li key={p.id}>
            <a href={`#/projects/${p.id}`}>{p.name}</a>
            <button onClick={() => remove(p)}>Delete</button>
          </li>
        ))}
      </ul>
    </>
  );
}

function Planner({ projectId, isAdmin, fail }) {
  const [guides] = useGuides(e => (e.status === 401 ? fail(e) : null));
  const [info, setInfo] = useState(null); // library item being viewed
  const [inputs, setInputs] = useState(null);
  const [combos, setCombos] = useState([]);
  const [contents, setContents] = useState({}); // key -> { done, hasDoc }
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState(null); // idea being edited
  const [error, setError] = useState('');
  const base = '/projects/' + projectId;
  const failHere = e => (e.status === 401 ? fail(e) : setError(e.message));

  useEffect(() => {
    api(base).then(p => {
      setInputs({ name: p.name, niche: p.niche, subs: p.subs, formats: p.formats, angles: p.angles });
      setContents(Object.fromEntries(p.contents.map(c => [key(c), c])));
      setCombos(build(p));
    }).catch(failHere);
  }, []);

  if (!inputs || !guides) return error ? <p role="alert" style={{ color: 'crimson' }}>{error} <a href="#/">Back to projects</a></p> : <p>Loading…</p>;

  // Admins edit library items on the Library screen; here everyone just reads them
  const showInfo = (kind, name) => setInfo(guides.find(g => g.kind === kind && g.name === name) ?? { id: -1, kind, name, description: 'This item is no longer in the library.' });

  const patch = (c, change) => setContents(prev => ({ ...prev, [key(c)]: { ...prev[key(c)], ...change } }));

  const mixNow = () => {
    setCombos(build(inputs));
    api(base, inputs).then(() => setError('')).catch(failHere);
  };

  const shuffle = () => {
    const a = [...combos];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    setCombos(a);
  };

  const toggle = (c, checked) => {
    patch(c, { done: checked });
    api(base + '/content', { sub: c.sub, format: c.format, angle: c.angle, done: checked })
      .then(() => setError(''))
      .catch(e => { failHere(e); patch(c, { done: !checked }); }); // roll back the tick if it didn't save
  };

  const downloadCsv = () => {
    const cell = v => `"${String(v).replace(/"/g, '""')}"`;
    const rows = [['Sub-niche', 'Format', 'Angle', 'Brief', 'Done'], ...combos.map(c => [c.sub, c.format, c.angle, c.brief, contents[key(c)]?.done ? 'yes' : ''])];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([rows.map(r => r.map(cell).join(',')).join('\n')], { type: 'text/csv' }));
    a.download = `${inputs.name || 'content-ideas'}.csv`;
    a.click();
  };

  const q = filter.toLowerCase();
  const shown = combos.filter(c => !q || c.brief.toLowerCase().includes(q));
  const nDone = combos.filter(c => contents[key(c)]?.done).length;
  const set = name => e => setInputs({ ...inputs, [name]: e.target.value });
  const field = (name, label, placeholder) => (
    <div>
      <label htmlFor={name}>{label} <small>(one per line)</small></label>
      <textarea id={name} placeholder={placeholder} value={inputs[name]} onChange={set(name)} />
    </div>
  );

  return (
    <>
      <p><a href="#/">← All projects</a></p>
      <div className="grid">
        <div><label htmlFor="pname">Project name</label><input id="pname" value={inputs.name} onChange={set('name')} /></div>
        <div><label htmlFor="niche">Main niche</label><input id="niche" placeholder="e.g. Building on socials" value={inputs.niche} onChange={set('niche')} /></div>
      </div>
      <div className="grid" style={{ marginTop: 12 }}>
        {field('subs', 'Sub-niches', 'e.g.\nMindset\nProduct optimisation\nLife automation')}
        <Picker kind="format" guides={guides} value={inputs.formats} onChange={v => setInputs({ ...inputs, formats: v })} onInfo={showInfo} />
        <Picker kind="angle" guides={guides} value={inputs.angles} onChange={v => setInputs({ ...inputs, angles: v })} onInfo={showInfo} />
      </div>

      <div className="bar">
        <button className="primary" onClick={mixNow}>Mix &amp; save</button>
        <button onClick={shuffle}>Shuffle</button>
        <button onClick={() => setCombos(build(inputs))}>Original order</button>
        <button onClick={downloadCsv}>Download CSV</button>
        <input placeholder="Filter…" value={filter} onChange={e => setFilter(e.target.value)} />
        <span id="count">{shown.length} of {combos.length} ideas · {nDone} done</span>
      </div>
      {error && <p role="alert" style={{ color: 'crimson' }}>{error}</p>}
      {combos.length === 0 && <p>Add your niche and at least one sub-niche, format and angle, then click <b>Mix &amp; save</b>.</p>}
      {combos.length > 0 && <p><small>Click an idea to write notes for it.</small></p>}

      <div className="wrap"><table>
        <thead><tr><th>Done</th><th>#</th><th>Sub-niche</th><th>Format</th><th>Angle</th><th>Brief</th><th>Notes</th></tr></thead>
        <tbody>
          {shown.map((c, i) => {
            const st = contents[key(c)] ?? {};
            return (
              <tr key={key(c)} className={`idea ${st.done ? 'done' : ''}`} onClick={() => setOpen(c)}>
                <td onClick={e => e.stopPropagation()}><input type="checkbox" aria-label="Mark done" checked={!!st.done} onChange={e => toggle(c, e.target.checked)} /></td>
                <td>{i + 1}</td><td>{c.sub}</td>
                <td><button className="link" onClick={e => { e.stopPropagation(); showInfo('format', c.format); }}>{c.format}</button></td>
                <td><button className="link" onClick={e => { e.stopPropagation(); showInfo('angle', c.angle); }}>{c.angle}</button></td>
                <td><button className="link" onClick={e => { e.stopPropagation(); setOpen(c); }}>{c.brief}</button></td>
                <td>{st.hasDoc ? '📝' : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table></div>

      {info && <GuideModal guide={info} isAdmin={false} fail={fail} onClose={() => setInfo(null)} />}
      {open && <DocEditor base={base} idea={open} fail={failHere} onSaved={hasDoc => patch(open, { hasDoc })} onClose={() => setOpen(null)} />}
    </>
  );
}

function DocEditor({ base, idea, fail, onSaved, onClose }) {
  const [doc, setDoc] = useState(null);
  const [status, setStatus] = useState('');
  const saved = useRef('');
  const timer = useRef();
  const ideaKey = { sub: idea.sub, format: idea.format, angle: idea.angle };

  useEffect(() => {
    api(`${base}/content?${new URLSearchParams(ideaKey)}`).then(c => { saved.current = c.doc; setDoc(c.doc); }).catch(fail);
    return () => clearTimeout(timer.current);
  }, []);

  const save = text => {
    if (text === saved.current) return Promise.resolve();
    setStatus('Saving…');
    return api(base + '/content', { ...ideaKey, doc: text })
      .then(() => { saved.current = text; setStatus('Saved'); onSaved(text.trim() !== ''); })
      .catch(e => { setStatus('Not saved: ' + e.message); fail(e); throw e; });
  };

  const change = e => {
    const text = e.target.value;
    setDoc(text);
    setStatus('Unsaved changes');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => save(text).catch(() => {}), 800); // autosave after you stop typing
  };

  // Save before closing; stay open if the save fails so nothing is lost
  const close = () => { clearTimeout(timer.current); save(doc ?? '').then(onClose, () => {}); };

  return (
    <div className="overlay" onClick={close}>
      <div className="editor" role="dialog" aria-modal="true" aria-labelledby="ed-title" onClick={e => e.stopPropagation()}
        onKeyDown={e => e.key === 'Escape' && close()}>
        <div className="bar" style={{ justifyContent: 'space-between', marginTop: 0 }}>
          <h2 id="ed-title" style={{ margin: 0, fontSize: 18 }}>{idea.brief}</h2>
          <button onClick={close}>Close</button>
        </div>
        {doc === null ? <p>Loading…</p> : (
          <textarea autoFocus value={doc} onChange={change} aria-label="Notes"
            placeholder={'What do you want to say?\n\nHook:\n\nMain points:\n- \n\nCall to action:'} />
        )}
        <small>{status}</small>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Root />);
