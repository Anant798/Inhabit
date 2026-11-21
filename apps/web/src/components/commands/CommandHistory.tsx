import { CheckCircle, XCircle } from 'lucide-react';
import type { Command } from '../../types/commands';

const MOCK_HISTORY: Command[] = [
  { transcript: 'Move chair to the corner', timestamp: Date.now() - 3600000, status: 'success' },
  { transcript: 'Rotate lamp 45 degrees', timestamp: Date.now() - 1800000, status: 'failure' },
];

const CommandHistory = () => (
  <div className="bg-white border-t border-gray-200 p-6">
    <h3 className="font-semibold text-lg mb-4">Recent Commands</h3>
    <div className="grid grid-cols-2 gap-4">
      {MOCK_HISTORY.map((cmd) => (
        <div key={cmd.transcript} className="bg-gray-50 p-4 rounded border border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">{cmd.transcript}</p>
            <p className="text-xs text-gray-400">{new Date(cmd.timestamp).toLocaleTimeString()}</p>
          </div>
          {cmd.status === 'success' ? <CheckCircle className="text-green-500" size={20} /> : <XCircle className="text-red-500" size={20} />}
        </div>
      ))}
    </div>
  </div>
);

export default CommandHistory;