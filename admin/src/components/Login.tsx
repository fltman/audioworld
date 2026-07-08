import { useState } from 'react';
import type { User } from '@audioworld/shared';
import { api, setToken } from '../api';

export default function Login({ onAuthed }: { onAuthed: (user: User) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = mode === 'login' ? await api.login(email, password) : await api.register(email, password);
      setToken(res.token);
      onAuthed(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="brand" style={{ padding: 0 }}>
          AudioWorld<span>Admin</span>
        </div>
        <h2>{mode === 'login' ? 'Sign in' : 'Create account'}</h2>

        <label className="form-field">
          <span className="label">Email</span>
          <input
            className="input"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
            required
          />
        </label>
        <label className="form-field">
          <span className="label">Password</span>
          <input
            className="input"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            required
          />
        </label>

        {error && <div className="error">{error}</div>}

        <button type="submit" className="btn btn-accent" disabled={busy}>
          {busy ? '…' : mode === 'login' ? 'Sign in' : 'Register'}
        </button>

        <button
          type="button"
          className="link-toggle"
          onClick={() => {
            setMode((m) => (m === 'login' ? 'register' : 'login'));
            setError(null);
          }}
        >
          {mode === 'login' ? 'Need an account? Register' : 'Have an account? Sign in'}
        </button>
        {mode === 'register' && (
          <p className="muted" style={{ fontSize: 12 }}>
            New accounts start with no authoring access — an admin grants your role.
          </p>
        )}
      </form>
    </div>
  );
}
