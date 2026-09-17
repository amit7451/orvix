import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ShieldCheck, LayoutDashboard, Server, AlertTriangle, Zap, BarChart3,
  Database, Wrench, Bell, Wifi, WifiOff
} from 'lucide-react';
import { API_BASE } from '../types';
import { useEventStream } from '../context/EventStreamContext';

interface LayoutProps {
  children: React.ReactNode;
}

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard, section: 'overview' },
  { path: '/services', label: 'Services', icon: Server, section: 'overview' },
  { path: '/incidents', label: 'Incidents', icon: AlertTriangle, section: 'overview' },
  { path: '/simulation', label: 'Simulation', icon: Zap, section: 'operations' },
  { path: '/analytics', label: 'Analytics', icon: BarChart3, section: 'intelligence' },
  { path: '/knowledge', label: 'Knowledge Base', icon: Database, section: 'intelligence' },
  { path: '/tools', label: 'Tool Registry', icon: Wrench, section: 'intelligence' },
  { path: '/notifications', label: 'Notifications', icon: Bell, section: 'intelligence' },
];

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { connected: wsConnected } = useEventStream();
  const [pendingApprovals, setPendingApprovals] = useState(0);

  // Poll pending approvals for badge
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/approvals?decision=PENDING`);
        if (res.ok) {
          const data = await res.json();
          setPendingApprovals(data.length);
        }
      } catch {}
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, []);

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const sections: Record<string, string> = {
    overview: 'Monitoring',
    operations: 'Operations',
    intelligence: 'Intelligence',
  };

  const groupedItems = navItems.reduce((acc, item) => {
    if (!acc[item.section]) acc[item.section] = [];
    acc[item.section].push(item);
    return acc;
  }, {} as Record<string, typeof navItems>);

  return (
    <div className="app-container">
      <header className="main-header">
        <div className="header-brand" style={{ cursor: 'pointer' }} onClick={() => navigate('/')}>
          <ShieldCheck size={24} />
          <span>ORVIX</span>
          <span className="brand-tag">AI Platform</span>
        </div>
        
        <div className="header-actions">
          <div className="connection-indicator">
            <div className={`connection-dot ${wsConnected ? '' : 'offline'}`} />
            {wsConnected ? (
              <><Wifi size={13} /> Live</>
            ) : (
              <><WifiOff size={13} /> Offline</>
            )}
          </div>
        </div>
      </header>
      
      <div className="app-body">
        <aside className="sidebar">
          <nav className="sidebar-nav">
            {Object.entries(groupedItems).map(([section, items]) => (
              <React.Fragment key={section}>
                <div className="sidebar-section-label">{sections[section]}</div>
                {items.map(item => (
                  <button
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    className={`nav-item ${isActive(item.path) ? 'active' : ''}`}
                  >
                    <item.icon size={17} />
                    {item.label}
                    {item.path === '/incidents' && pendingApprovals > 0 && (
                      <span className="nav-badge">{pendingApprovals}</span>
                    )}
                  </button>
                ))}
              </React.Fragment>
            ))}
          </nav>
        </aside>
        
        <main className="main-content">
          {children}
        </main>
      </div>
    </div>
  );
};
