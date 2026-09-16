import React from 'react';
import { RotateCcw } from 'lucide-react';
import { ServiceList } from '../components/ServiceList';
import { IncidentList } from '../components/IncidentList';

export const UserDashboard: React.FC = () => {

  const resetSimulation = async () => {
    try {
      await fetch('http://localhost:8000/api/simulation/reset', {
        method: 'POST'
      });
      alert('Simulation reset. All injected failures have been cleared.');
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1>Infrastructure Overview</h1>
          <p className="text-muted">Monitored services and active incidents</p>
        </div>
        <div>
          <button className="btn btn-outline border-destructive text-destructive hover:bg-destructive/10" onClick={resetSimulation} style={{ borderColor: 'var(--destructive)', color: 'var(--destructive)'}}>
            <RotateCcw size={16} /> Reset Simulation
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <ServiceList />
        <IncidentList />
      </div>
    </div>
  );
};
