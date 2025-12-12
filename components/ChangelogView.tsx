
import React from 'react';
import Button from './Button';

export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  changes: string[];
  isMajor?: boolean;
}

interface ChangelogViewProps {
  entries: ChangelogEntry[];
  onBack: () => void;
}

const ChangelogView: React.FC<ChangelogViewProps> = ({ entries, onBack }) => {
  return (
    <div className="max-w-4xl mx-auto p-6 sm:p-8 animate-fadeIn">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-serif font-bold text-academic-900">System Updates</h2>
          <p className="text-gray-500 mt-2">Latest features, improvements, and fixes.</p>
        </div>
        <Button onClick={onBack} variant="secondary">Back to Dashboard</Button>
      </div>

      <div className="relative border-l-2 border-gray-200 ml-3 sm:ml-6 space-y-12">
        {entries.map((entry, index) => (
          <div key={entry.version} className="relative pl-8 sm:pl-12">
            {/* Timeline Dot */}
            <div className={`absolute -left-[9px] top-0 w-5 h-5 rounded-full border-4 border-white ${entry.isMajor ? 'bg-purple-600 w-6 h-6 -left-[11px]' : 'bg-gray-400'}`}></div>
            
            <div className="flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-4 mb-2">
              <h3 className="text-xl font-bold text-gray-900">
                v{entry.version}
                {entry.isMajor && <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full uppercase tracking-wide">Major Update</span>}
              </h3>
              <span className="text-sm font-mono text-gray-500">{entry.date}</span>
            </div>
            
            <h4 className="text-lg font-medium text-academic-700 mb-3">{entry.title}</h4>
            
            <ul className="space-y-2 text-gray-600 bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
              {entry.changes.map((change, i) => (
                <li key={i} className="flex items-start gap-2 text-sm leading-relaxed">
                  <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {change}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      
      <div className="mt-12 text-center pt-8 border-t border-gray-200">
        <p className="text-gray-400 text-sm">End of logs.</p>
      </div>
    </div>
  );
};

export default ChangelogView;
