// frontend/app/admin/Login.tsx
"use client";

import { useState, FormEvent } from 'react';

interface LoginProps {
  onLoginSuccess: () => void;
}

export default function LoginComponent({ onLoginSuccess }: LoginProps) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");

      // On successful login, call the function passed from the parent (AdminLayout)
      // which will trigger the global `checkAuthStatus` action.
      onLoginSuccess();

    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="add-form-container" style={{maxWidth: '400px', margin: '50px auto'}}>
        <form onSubmit={handleSubmit} className="add-form">
            <h3>Admin Login</h3>
            {error && <p className="error-message">{error}</p>}
            <div className="form-group">
                <label htmlFor="username">Username</label>
                <input type="text" id="username" value={username} readOnly disabled />
            </div>
            <div className="form-group">
                <label htmlFor="password">Password</label>
                <input type="password" id="password" value={password} onChange={e => setPassword(e.target.value)} required autoFocus />
            </div>
            <button type="submit" className="action-button add-button" disabled={isLoading}>
                {isLoading ? "Logging in..." : "Login"}
            </button>
        </form>
    </div>
  );
}
