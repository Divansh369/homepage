"use client";
import { useEffect, useState, useCallback, ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ThemeProvider, useTheme } from './ThemeContext';
import { useProjectStore } from '../store/projectStore';
import LoginComponent from './admin/Login';
import './globals.css';
import './admin.css';

function AdminRoot({ children }: { children: ReactNode }) {
    const { theme } = useTheme();
    const pathname = usePathname();
    const router = useRouter();
    const { isAuthenticated, checkAuthStatus, logout } = useProjectStore();
    const [customPort, setCustomPort] = useState('');

    useEffect(() => {
        if (isAuthenticated === null) checkAuthStatus();
    }, [isAuthenticated, checkAuthStatus]);

    const handleLogout = async () => {
        await logout();
        router.push('/');
    };
    
    const handleOpenCustomPort = useCallback(() => {
        const port = customPort.trim();
        if (!port || !/^\d+$/.test(port)) return;
        window.open(`http://localhost:${port}`, '_blank', 'noopener,noreferrer');
        setCustomPort('');
    }, [customPort]);

    if (isAuthenticated === null) return <div className={`container ${theme}`}><p>Checking authentication...</p></div>;
    if (!isAuthenticated) return <div className={theme}><LoginComponent onLoginSuccess={checkAuthStatus} /></div>;

    return (
        <div className={`admin-container ${theme}`}>
            <header className="admin-header">
                <h1>Admin Panel</h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <div className="filter-container custom-port-opener">
                        <label>Open Port:</label>
                        <input type="text" className="custom-port-input navbar-control" value={customPort} onChange={(e) => setCustomPort(e.target.value)} placeholder="e.g. 3000"/>
                        <button onClick={handleOpenCustomPort} className="action-button open-custom-button">🔗</button>
                    </div>
                    <button onClick={handleLogout} className="action-button-table cancel">Logout</button>
                </div>
            </header>
            <div className="admin-main">
                <nav className="admin-sidebar">
                    <Link href="/admin/projects" className={`admin-nav-link ${pathname.startsWith('/admin/projects') || pathname === '/admin' ? 'active' : ''}`}>Projects</Link>
                    <Link href="/admin/labels" className={`admin-nav-link ${pathname.startsWith('/admin/labels') ? 'active' : ''}`}>Labels</Link>
                </nav>
                <section className="admin-content">{children}</section>
            </div>
        </div>
    );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="en">
            <body>
                <ThemeProvider>
                    <AdminRoot>{children}</AdminRoot>
                </ThemeProvider>
            </body>
        </html>
    );
}
