import { Search, Download, Plus, Moon, Command, Box } from 'lucide-react';

export function Header() {
  return (
    <header className="header">
      <div className="segment-control">
        <div className="segment-item active">
          <Box size={16} />
          Skills
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="search-bar">
          <Search size={16} className="text-tertiary" />
          <input 
            type="text" 
            placeholder="Search Skill..." 
            className="search-input"
          />
        </div>

        <button className="btn btn-primary flex items-center gap-2">
          <Plus size={16} />
          新建
        </button>

        <button className="btn-icon btn-ghost">
          <Moon size={20} />
        </button>
      </div>
    </header>
  );
}
