// frontend/app/admin/layout.tsx
"use client";

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTheme } from '../ThemeContext';
import { useProjectStore } from '../../store/projectStore';
import LoginComponent from './Login';
import '../globals.css';
import './admin.css';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const router = useRouter();

  const { isAuthenticated, checkAuthStatus, logout } = useProjectStore();

  useEffect(() => {
    // Check auth status on mount if it hasn't been checked yet
    if (isAuthenticated === null) {
      checkAuthStatus();
    }
  }, [isAuthenticated, checkAuthStatus]);

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };
  
  if (isAuthenticated === null) {
    return <div className={`container ${theme}`}><p className="loading-indicator">Checking authentication...</p></div>;
  }
  
  if (!isAuthenticated) {
    // Pass the checkAuthStatus action to the login component so it can trigger a re-check
    return <div className={theme}><LoginComponent onLoginSuccess={checkAuthStatus} /></div>;
  }

  return (
    <div className={theme}>
        <div className="admin-container">
            <header className="admin-header">
                <h1>Admin Panel</h1>
                <div>
                  <button onClick={handleLogout} className="action-button-table cancel" style={{marginRight: '20px'}}>Logout</button>
                  <Link href="/" className="back-link">← Back to Dashboard</Link>
                </div>
            </header>
            <div className="admin-main">
                <nav className="admin-sidebar">
                    <Link href="/admin/projects" className="admin-nav-link">Projects</Link>
                    <Link href="/admin/labels" className="admin-nav-link">Labels</Link>
                </nav>
                <section className="admin-content">
                    {children}
                </section>
            </div>
        </div>
    </div>
  );
}
