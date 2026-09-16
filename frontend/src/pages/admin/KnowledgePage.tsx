import React, { useState } from 'react';

export const KnowledgePage: React.FC = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);

  const searchKnowledge = async () => {
    try {
      const res = await fetch(`http://localhost:8000/api/knowledge/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setResults(data);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div>
      <h1 className="mb-6">Knowledge Base Explorer</h1>
      <div className="card mb-6">
        <div className="card-content">
          <div className="flex gap-2 mb-4">
            <input 
              type="text" 
              className="flex-1 p-2 border rounded" 
              placeholder="Search runbooks..." 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchKnowledge()}
            />
            <button className="btn btn-primary" onClick={searchKnowledge}>Search</button>
          </div>
          
          <div className="grid gap-4">
            {results.map((res, i) => (
              <div key={i} className="p-4 border rounded">
                <div className="font-medium text-lg">{res.title}</div>
                <div className="text-sm text-muted mb-2">Relevance Score: {res.score.toFixed(3)}</div>
                <div className="text-sm p-3 bg-slate-50 rounded border">{res.snippet}</div>
              </div>
            ))}
            {results.length === 0 && <div className="text-muted">No results.</div>}
          </div>
        </div>
      </div>
    </div>
  );
};
