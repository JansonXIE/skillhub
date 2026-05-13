import { useState } from 'react';
import { Search, Plus, Moon, Box } from 'lucide-react';
import { NewSkillModal } from './NewSkillModal';

export function Header() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <header className="header">
      <div className="segment-control">
        <div className="segment-item active">
          <Box size={16} />
          Skill
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

        <button 
          className="btn btn-primary flex items-center gap-2"
          onClick={() => setIsModalOpen(true)}
        >
          <Plus size={16} />
          新建
        </button>

        <button className="btn btn-icon btn-ghost">
          <Moon size={20} />
        </button>
      </div>
      
      <NewSkillModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </header>
  );
}
