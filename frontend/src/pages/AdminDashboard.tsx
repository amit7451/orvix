import React from 'react';
import { LiveTerminal } from '../components/LiveTerminal';
import { ApprovalQueue } from '../components/ApprovalQueue';

export const AdminDashboard: React.FC = () => {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1>Admin Control Center</h1>
          <p className="text-muted">Overwatch and live autonomous agent stream</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <LiveTerminal />
        </div>
        <div>
          <ApprovalQueue />
        </div>
      </div>
    </div>
  );
};
