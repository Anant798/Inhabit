import { Settings, User, Radio } from 'lucide-react';

const Navbar = () => (
  <nav className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shadow-sm">
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 bg-charcoal rounded-sm" />
      <h1 className="text-xl font-bold tracking-tight">Inhabit AI</h1>
    </div>
    <div className="flex items-center gap-6">
      <span className="text-sm text-gray-500">Project: Living Room Revamp</span>
      <div className="flex items-center gap-2 text-green-600 text-sm">
        <Radio size={16} />
        <span>Live</span>
      </div>
      <Settings size={20} className="text-gray-600 cursor-pointer" />
      <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
        <User size={18} />
      </div>
    </div>
  </nav>
);

export default Navbar;