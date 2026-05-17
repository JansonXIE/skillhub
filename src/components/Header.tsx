import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Box } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { appDataDir, join } from '@tauri-apps/api/path';
import { NewSkillModal } from './NewSkillModal';
import { AIReviewModal } from './modals/AIReviewModal';

interface SkillInfo {
  name: string;
  description: string | null;
}

export function Header() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [reviewSkill, setReviewSkill] = useState<{ name: string; content: string } | null>(null);
  
  // Search state
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Load skills list from local storage/tauri
  const fetchSkills = async () => {
    try {
      let dataPath = localStorage.getItem('skillhub-data-path');
      if (!dataPath) {
        const baseDir = await appDataDir();
        dataPath = await join(baseDir, 'SkillsHub');
      }
      const result: SkillInfo[] = await invoke('get_local_skills', { dataPath });
      setSkills(result);
    } catch (error) {
      console.error('Header failed to fetch skills:', error);
    }
  };

  // Listen to click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Listen to custom updates from other components to re-fetch
  useEffect(() => {
    window.addEventListener('skills-updated', fetchSkills);
    return () => {
      window.removeEventListener('skills-updated', fetchSkills);
    };
  }, []);

  const handleSelectSkill = (skillName: string) => {
    setSearchQuery('');
    setShowDropdown(false);

    const currentPath = window.location.pathname;
    const isSkillPage = ['/', '/favorites', '/distributed', '/pending'].includes(currentPath);

    // Save selected skill in sessionStorage so that the target page can highlight it
    sessionStorage.setItem('highlight-skill', skillName);

    if (!isSkillPage) {
      navigate('/');
    } else {
      // Trigger the highlight event for the current active page
      window.dispatchEvent(new CustomEvent('highlight-skill', { detail: { skillName } }));
    }
  };

  const filteredSkills = skills.filter(skill => 
    skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (skill.description && skill.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <header className="header">
      <div className="segment-control">
        <div className="segment-item active">
          <Box size={16} />
          Skill
        </div>
      </div>

      <div className="search-bar-container" ref={containerRef}>
        <div className="search-bar">
          <Search size={16} className="text-tertiary" />
          <input 
            type="text" 
            placeholder="Search Skill..." 
            className="search-input focus:outline-none"
            style={{ outline: 'none' }}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => {
              fetchSkills();
              setShowDropdown(true);
            }}
          />
        </div>

        {showDropdown && searchQuery && (
          <div className="search-dropdown">
            {filteredSkills.length === 0 ? (
              <div className="search-no-results">没有找到匹配的 skill</div>
            ) : (
              filteredSkills.map((skill, index) => (
                <div 
                  key={index} 
                  className="search-dropdown-item focus:outline-none"
                  style={{ outline: 'none' }}
                  onClick={() => handleSelectSkill(skill.name)}
                >
                  <div className="search-item-icon">
                    {skill.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="search-item-info">
                    <div className="search-item-name">{skill.name}</div>
                    <div className="search-item-desc">{skill.description || '暂无描述'}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        <button 
          className="btn btn-primary flex items-center gap-2 focus:outline-none"
          style={{ outline: 'none' }}
          onClick={() => setIsModalOpen(true)}
        >
          <Plus size={16} />
          新建
        </button>
      </div>
      
      <NewSkillModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onCreated={(name, content) => setReviewSkill({ name, content })}
      />

      {reviewSkill && (
        <AIReviewModal 
          isOpen={true} 
          onClose={() => setReviewSkill(null)}
          skillName={reviewSkill.name}
          skillContent={reviewSkill.content}
        />
      )}
    </header>
  );
}
