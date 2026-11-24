import { Settings, User, Radio } from 'lucide-react';

const Navbar = () => (
  <nav className="min-h-14 bg-white border-b border-gray-200 flex items-center justify-between gap-3 px-4 py-3 shadow-sm md:h-16 md:px-6">
    <div className="flex min-w-0 items-center gap-3">
      <div className="h-8 w-8 shrink-0 bg-charcoal rounded-sm" />
      <h1 className="truncate text-lg font-bold tracking-tight md:text-xl">Inhabit AI</h1>
    </div>
    <div className="flex shrink-0 items-center gap-3 md:gap-6">
      <span className="hidden text-sm text-gray-500 lg:inline">Project: Living Room Revamp</span>
      <div className="flex items-center gap-2 text-green-600 text-sm">
        <Radio size={16} />
        <span className="hidden sm:inline">Live</span>
      </div>
      <Settings size={20} className="hidden cursor-pointer text-gray-600 sm:block" />
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200">
        <User size={18} />
      </div>
    </div>
  </nav>
);

export default Navbar;
