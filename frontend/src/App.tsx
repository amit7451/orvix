import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { UserDashboard } from './pages/UserDashboard';
import { AdminDashboard } from './pages/AdminDashboard';
import { AnalyticsPage } from './pages/admin/AnalyticsPage';
import { KnowledgePage } from './pages/admin/KnowledgePage';
import { ToolsPage } from './pages/admin/ToolsPage';
import { NotificationsPage } from './pages/admin/NotificationsPage';

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<UserDashboard />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/analytics" element={<AnalyticsPage />} />
          <Route path="/admin/knowledge" element={<KnowledgePage />} />
          <Route path="/admin/tools" element={<ToolsPage />} />
          <Route path="/admin/notifications" element={<NotificationsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
