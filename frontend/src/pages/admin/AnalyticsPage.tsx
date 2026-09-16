import React, { useState, useEffect } from 'react';
import type { AnalyticsOverview } from '../../types';

export const AnalyticsPage: React.FC = () => {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);

  useEffect(() => {
    fetch('http://localhost:8000/api/analytics/overview')
      .then(res => res.json())
      .then(setOverview)
      .catch(console.error);
  }, []);

  return (
    <div>
      <h1 className="mb-6">Analytics Dashboard</h1>
      {overview ? (
        <div className="grid grid-cols-4 gap-4">
          <div className="card p-4">
            <div className="text-muted text-sm">Total Incidents</div>
            <div className="text-2xl font-bold">{overview.total_incidents}</div>
          </div>
          <div className="card p-4">
            <div className="text-muted text-sm">Active Incidents</div>
            <div className="text-2xl font-bold">{overview.active_incidents}</div>
          </div>
          <div className="card p-4">
            <div className="text-muted text-sm">Resolved Incidents</div>
            <div className="text-2xl font-bold">{overview.resolved_incidents}</div>
          </div>
          <div className="card p-4">
            <div className="text-muted text-sm">Escalated Incidents</div>
            <div className="text-2xl font-bold">{overview.escalated_incidents}</div>
          </div>
        </div>
      ) : (
        <div>Loading analytics...</div>
      )}
    </div>
  );
};
