import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, auth } from '../api.js';
import { Msg, useAct } from '../ui.jsx';

function Form({ title, fields, path, onAuth }) {
  const nav = useNavigate(); const [v, setV] = useState({}); const [msg, run] = useAct();
  const submit = () => run(async () => {
    const body = Object.fromEntries(Object.entries(v).filter(([, x]) => x));
    const r = await api(path, { method: 'POST', body });
    auth.set(r.user, r.token); onAuth(r.user);
    nav(r.user.role === 'seller' ? '/seller' : r.user.role === 'admin' ? '/admin' : '/');
  }, 'Welcome!');
  return (<><h2>{title}</h2>
    {fields.map(([k, label, type]) => <div key={k}><input type={type || 'text'} placeholder={label} value={v[k] || ''} onChange={e => setV({ ...v, [k]: e.target.value })} /></div>)}
    <button onClick={submit}>{title}</button><Msg m={msg} /></>);
}
export const Login = ({ onAuth }) => <Form title="Login" path="/auth/login" onAuth={onAuth} fields={[['email', 'Email'], ['password', 'Password', 'password']]} />;
export function Register({ onAuth }) {
  const [seller, setSeller] = useState(false);
  return (<>
    <label><input type="checkbox" checked={seller} onChange={e => setSeller(e.target.checked)} /> Register as a seller</label>
    <Form key={seller} title="Register" path="/auth/register" onAuth={onAuth}
      fields={[['full_name', 'Full name'], ['email', 'Email'], ['phone', 'Phone (10 digits, optional)'], ['password', 'Password (6+ chars)', 'password'],
        ...(seller ? [['store_name', 'Store name'], ['gst_no', 'GST number (15 chars)']] : [])]} /></>);
}
