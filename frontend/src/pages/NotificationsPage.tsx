import React, { useState, useEffect } from 'react';
import { Bell, Mail, MessageSquare, Monitor, CheckCircle, XCircle } from 'lucide-react';
import type { Notification } from '../types';
import { API_BASE } from '../types';

export const NotificationsPage: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    fetch(`${API_BASE}/api/notifications`)
      .then(res => res.json())
      .then(setNotifications)
      .catch(console.error);
  }, []);

  const channelIcon = (channel: string) => {
    switch (channel.toLowerCase()) {
      case 'email': return <Mail size={14} />;
      case 'slack': return <MessageSquare size={14} />;
      case 'console': return <Monitor size={14} />;
      default: return <Bell size={14} />;
    }
  };

  return (
    <div className="animate-fadeIn">
      <div className="page-header">
        <div>
          <h1>Notifications</h1>
          <p className="page-subtitle">History of all notifications sent by the platform</p>
        </div>
      </div>

      <div className="card">
        <div className="card-content p-0">
          <table>
            <thead>
              <tr>
                <th className="p-4">Channel</th>
                <th className="p-4">Subject</th>
                <th className="p-4">Status</th>
                <th className="p-4">Sent At</th>
              </tr>
            </thead>
            <tbody>
              {notifications.map(n => (
                <tr key={n.id}>
                  <td className="p-4">
                    <div className="flex items-center gap-2 text-xs">
                      {channelIcon(n.channel)}
                      <span className="uppercase font-semibold">{n.channel}</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="text-sm">{n.subject}</div>
                    {n.body && <div className="text-xs text-muted mt-1 truncate" style={{ maxWidth: '400px' }}>{n.body}</div>}
                  </td>
                  <td className="p-4">
                    <span className={`badge ${n.status === 'SENT' ? 'badge-success' : 'badge-destructive'}`}>
                      {n.status === 'SENT' ? <CheckCircle size={10} className="mr-1" /> : <XCircle size={10} className="mr-1" />}
                      {n.status}
                    </span>
                  </td>
                  <td className="p-4 text-sm text-muted font-mono">
                    {new Date(n.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
              {notifications.length === 0 && (
                <tr>
                  <td colSpan={4}>
                    <div className="empty-state p-6">
                      <Bell size={32} className="empty-icon" />
                      <div>No notifications yet</div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
