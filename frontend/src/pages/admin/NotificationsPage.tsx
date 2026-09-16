import React, { useState, useEffect } from 'react';
import type { Notification } from '../../types';

export const NotificationsPage: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    fetch('http://localhost:8000/api/notifications')
      .then(res => res.json())
      .then(setNotifications)
      .catch(console.error);
  }, []);

  return (
    <div>
      <h1 className="mb-6">Notifications History</h1>
      <div className="card">
        <div className="card-content p-0">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-muted border-b">
              <tr>
                <th className="p-4 font-medium">Channel</th>
                <th className="p-4 font-medium">Subject</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium">Sent At</th>
              </tr>
            </thead>
            <tbody>
              {notifications.map(n => (
                <tr key={n.id} className="border-b last:border-0 hover:bg-slate-50">
                  <td className="p-4 uppercase">{n.channel}</td>
                  <td className="p-4">{n.subject}</td>
                  <td className="p-4">
                    <span className={`badge ${n.status === 'SENT' ? 'badge-success' : 'badge-destructive'}`}>
                      {n.status}
                    </span>
                  </td>
                  <td className="p-4">{new Date(n.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
