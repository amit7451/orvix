import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ShieldCheck, LayoutDashboard, BarChart3, Database, Wrench, Bell } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const isAdmin = location.pathname.startsWith('/admin');

  return (
    <div className="app-container" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <header className="main-header" style={{ flexShrink: 0 }}>
        <div className="header-brand">
          <ShieldCheck size={28} />
          ORVIX
        </div>
        
        <div className="header-actions">
          <span className="text-sm text-muted">Role View:</span>
          <label className="switch-label text-sm">
            User
            <div className="switch">
              <input 
                type="checkbox" 
                checked={isAdmin} 
                onChange={(e) => {
                  navigate(e.target.checked ? '/admin' : '/');
                }}
              />
              <span className="slider"></span>
            </div>
            Admin
          </label>
        </div>
      </header>
      
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {isAdmin && (
          <aside style={{ width: '250px', borderRight: '1px solid var(--border)', backgroundColor: 'var(--card)', display: 'flex', flexDirection: 'column' }}>
            <nav style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <button 
                onClick={() => navigate('/admin')}
                className={`btn ${location.pathname === '/admin' ? 'btn-outline' : 'btn-ghost'}`}
                style={{ justifyContent: 'flex-start', border: location.pathname === '/admin' ? '1px solid var(--border)' : 'none' }}
              >
                <LayoutDashboard size={18} className="mr-2 text-muted" /> Control Center
              </button>
              <button 
                onClick={() => navigate('/admin/analytics')}
                className={`btn ${location.pathname === '/admin/analytics' ? 'btn-outline' : 'btn-ghost'}`}
                style={{ justifyContent: 'flex-start', border: location.pathname === '/admin/analytics' ? '1px solid var(--border)' : 'none' }}
              >
                <BarChart3 size={18} className="mr-2 text-muted" /> Analytics
              </button>
              <button 
                onClick={() => navigate('/admin/knowledge')}
                className={`btn ${location.pathname === '/admin/knowledge' ? 'btn-outline' : 'btn-ghost'}`}
                style={{ justifyContent: 'flex-start', border: location.pathname === '/admin/knowledge' ? '1px solid var(--border)' : 'none' }}
              >
                <Database size={18} className="mr-2 text-muted" /> Knowledge Base
              </button>
              <button 
                onClick={() => navigate('/admin/tools')}
                className={`btn ${location.pathname === '/admin/tools' ? 'btn-outline' : 'btn-ghost'}`}
                style={{ justifyContent: 'flex-start', border: location.pathname === '/admin/tools' ? '1px solid var(--border)' : 'none' }}
              >
                <Wrench size={18} className="mr-2 text-muted" /> Tool Registry
              </button>
              <button 
                onClick={() => navigate('/admin/notifications')}
                className={`btn ${location.pathname === '/admin/notifications' ? 'btn-outline' : 'btn-ghost'}`}
                style={{ justifyContent: 'flex-start', border: location.pathname === '/admin/notifications' ? '1px solid var(--border)' : 'none' }}
              >
                <Bell size={18} className="mr-2 text-muted" /> Notifications
              </button>
            </nav>
          </aside>
        )}
        
        <main className="main-content" style={{ flex: 1, overflowY: 'auto', padding: '2rem' }}>
          {children}
        </main>
      </div>
    </div>
  );
};
