import React, { useState } from 'react';
import { Database, Search, FileText, Tag } from 'lucide-react';
import type { KnowledgeSearchResult } from '../types';
import { API_BASE } from '../types';

export const KnowledgePage: React.FC = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<KnowledgeSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const searchKnowledge = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`${API_BASE}/api/knowledge/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data);
      }
    } catch (err) { console.error(err); }
    setSearching(false);
  };

  const typeColor = (type: string) => {
    switch (type) {
      case 'runbook': return 'badge-info';
      case 'postmortem': return 'badge-warning';
      case 'architecture': return 'badge-purple';
      default: return 'badge-muted';
    }
  };

  return (
    <div className="animate-fadeIn">
      <div className="page-header">
        <div>
          <h1>Knowledge Base</h1>
          <p className="page-subtitle">Search operational runbooks, postmortems, and architecture docs used by the AI agent for RAG retrieval</p>
        </div>
      </div>

      {/* Search */}
      <div className="card mb-6">
        <div className="card-content">
          <div className="flex gap-2">
            <div className="flex-1" style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }} />
              <input
                type="text"
                placeholder="Search runbooks, postmortems, architecture docs..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchKnowledge()}
                style={{ paddingLeft: '36px' }}
              />
            </div>
            <button className="btn btn-primary" onClick={searchKnowledge} disabled={searching}>
              {searching ? 'Searching...' : 'Search'}
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="grid gap-3">
        {results.map((res, i) => (
          <div key={i} className="card" style={{ animation: `slideUp 0.3s ease ${i * 50}ms backwards` }}>
            <div className="card-content">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <FileText size={16} style={{ color: 'var(--info)' }} />
                  <span className="font-semibold">{res.title}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`badge ${typeColor(res.document_type)}`}>{res.document_type}</span>
                  {res.service && <span className="badge badge-outline"><Tag size={10} className="mr-1" />{res.service}</span>}
                </div>
              </div>
              <div className="p-3 rounded text-sm" style={{ background: 'var(--secondary)' }}>
                {res.snippet}
              </div>
              <div className="flex items-center gap-3 mt-2">
                <div className="text-xs text-muted">
                  Relevance: <span className="font-semibold" style={{ color: res.score > 0.7 ? 'var(--success)' : res.score > 0.4 ? 'var(--warning)' : 'var(--muted-foreground)' }}>
                    {(res.score * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="metric-bar" style={{ width: '120px' }}>
                  <div className={`metric-bar-fill ${res.score > 0.7 ? 'good' : res.score > 0.4 ? 'warn' : 'critical'}`}
                       style={{ width: `${res.score * 100}%` }} />
                </div>
              </div>
            </div>
          </div>
        ))}
        {results.length === 0 && query && !searching && (
          <div className="empty-state">
            <Database size={40} className="empty-icon" />
            <div>No results found</div>
            <div className="text-xs text-muted">Try different search terms like "latency", "database", or "deployment"</div>
          </div>
        )}
        {!query && (
          <div className="empty-state">
            <Database size={40} className="empty-icon" />
            <div>Search the knowledge base</div>
            <div className="text-xs text-muted">The AI agent uses this knowledge during root cause analysis via RAG retrieval</div>
          </div>
        )}
      </div>
    </div>
  );
};
