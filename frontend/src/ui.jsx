import { useState, useEffect, useCallback } from 'react';
import { api } from './api.js';
export function useLoad(path) {
  const [data, setData] = useState(null); const [err, setErr] = useState('');
  const reload = useCallback(() => { api(path).then(d => { setData(d); setErr(''); }).catch(e => setErr(e.message)); }, [path]);
  useEffect(reload, [reload]);
  return { data, err, reload };
}
// run(fn, okText): runs an API action and shows its success / error message
export function useAct() {
  const [msg, setMsg] = useState(null);
  const run = async (f, ok = 'Done') => { try { const r = await f(); setMsg({ ok }); return r; } catch (e) { setMsg({ err: e.message }); } };
  return [msg, run];
}
export const Msg = ({ m }) => (m ? <p className={m.err ? 'err' : 'ok'}>{m.err || m.ok}</p> : null);
export const Table = ({ rows, render }) => !rows?.length ? <p className="mut">No data</p> : (
  <table><thead><tr>{Object.keys(rows[0]).map(k => <th key={k}>{k}</th>)}{render && <th />}</tr></thead>
    <tbody>{rows.map((r, i) => <tr key={i}>{Object.values(r).map((v, j) => <td key={j}>{String(v ?? '-')}</td>)}{render && <td>{render(r)}</td>}</tr>)}</tbody></table>);
