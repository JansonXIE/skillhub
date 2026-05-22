import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search, Plus, Box } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { appDataDir, join } from '@tauri-apps/api/path';
import { NewSkillModal } from './NewSkillModal';
import { AIReviewModal } from './modals/AIReviewModal';
import { fetchSkillsFromRepo } from '../utils/github';
import { fetchStoreSkills } from '../utils/storeRepo';
import type { StoreRepo } from '../types/store';

interface SkillInfo {
  name: string;
  description: string | null;
}

interface SearchItem {
  name: string;
  description: string | null;
  targetPath: string;
  highlightName?: string;
}

function readStoredJson<T>(key: string, fallback: T): T {
  const stored = localStorage.getItem(key);
  if (!stored) {
    return fallback;
  }

  try {
    return JSON.parse(stored) as T;
  } catch (error) {
    console.error(`Header failed to parse ${key}:`, error);
    return fallback;
  }
}

export function Header() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [reviewSkill, setReviewSkill] = useState<{ name: string; content: string } | null>(null);
  
  // Search state
  const [searchItems, setSearchItems] = useState<SearchItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [loadingSearch, setLoadingSearch] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const loadRequestRef = useRef(0);
  const location = useLocation();
  const navigate = useNavigate();

  const fetchLocalSkills = useCallback(async () => {
    let dataPath = localStorage.getItem('skillhub-data-path');
    if (!dataPath) {
      const baseDir = await appDataDir();
      dataPath = await join(baseDir, 'SkillsHub');
    }

    return invoke<SkillInfo[]>('get_local_skills', { dataPath });
  }, []);

  const getActiveStoreRepo = useCallback(() => {
    const storeRepos = readStoredJson<StoreRepo[]>('skillhub-store-repos', []);
    if (storeRepos.length === 0) {
      return null;
    }

    const segments = location.pathname.split('/').filter(Boolean);
    const [, owner, repo] = segments;

    if (segments[0] === 'store' && owner && repo) {
      return storeRepos.find(item => item.owner === owner && item.repo === repo) ?? null;
    }

    return storeRepos[0] ?? null;
  }, [location.pathname]);

  const loadSearchItems = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setLoadingSearch(true);

    try {
      if (location.pathname === '/favorites') {
        const [localSkills, favorites] = await Promise.all([
          fetchLocalSkills(),
          Promise.resolve(readStoredJson<string[]>('skillhub-favorites', [])),
        ]);

        if (requestId !== loadRequestRef.current) return;

        setSearchItems(
          localSkills
            .filter(skill => favorites.includes(skill.name))
            .map(skill => ({
              name: skill.name,
              description: skill.description,
              targetPath: '/favorites',
              highlightName: skill.name,
            }))
        );
        return;
      }

      if (location.pathname === '/distributed') {
        const [localSkills, distributedList] = await Promise.all([
          fetchLocalSkills(),
          Promise.resolve(readStoredJson<{ name: string; repoUrl: string }[]>('skillhub-distributed', [])),
        ]);

        if (requestId !== loadRequestRef.current) return;

        setSearchItems(
          localSkills
            .map(skill => {
              const meta = distributedList.find(item => item.name === skill.name);
              if (!meta) {
                return null;
              }

              return {
                name: skill.name,
                description: skill.description || `已分发至 ${meta.repoUrl}`,
                targetPath: '/distributed',
                highlightName: skill.name,
              };
            })
            .filter(Boolean) as SearchItem[]
        );
        return;
      }

      if (location.pathname === '/pending') {
        const [localSkills, distributedList] = await Promise.all([
          fetchLocalSkills(),
          Promise.resolve(readStoredJson<{ name: string }[]>('skillhub-distributed', [])),
        ]);
        const distributedNames = new Set(distributedList.map(item => item.name));

        if (requestId !== loadRequestRef.current) return;

        setSearchItems(
          localSkills
            .filter(skill => !distributedNames.has(skill.name))
            .map(skill => ({
              name: skill.name,
              description: skill.description,
              targetPath: '/pending',
              highlightName: skill.name,
            }))
        );
        return;
      }

      if (location.pathname.startsWith('/store')) {
        const activeRepo = getActiveStoreRepo();
        if (!activeRepo) {
          if (requestId !== loadRequestRef.current) return;
          setSearchItems([]);
          return;
        }

        const storeSkills = activeRepo.type === 'gerrit'
          ? await fetchStoreSkills(activeRepo)
          : await fetchSkillsFromRepo(activeRepo.owner, activeRepo.repo, activeRepo.skillsPath);
        if (requestId !== loadRequestRef.current) return;

        setSearchItems(
          storeSkills.map(skill => ({
            name: skill.name,
            description: `${skill.owner}/${skill.repo}`,
            targetPath: `/store/${skill.owner}/${skill.repo}`,
            highlightName: skill.name,
          }))
        );
        return;
      }

      const localSkills = await fetchLocalSkills();
      if (requestId !== loadRequestRef.current) return;

      setSearchItems(
        localSkills.map(skill => ({
          name: skill.name,
          description: skill.description,
          targetPath: '/',
          highlightName: skill.name,
        }))
      );
    } catch (error) {
      if (requestId !== loadRequestRef.current) return;
      console.error('Header failed to load search items:', error);
      setSearchItems([]);
    } finally {
      if (requestId === loadRequestRef.current) {
        setLoadingSearch(false);
      }
    }
  }, [fetchLocalSkills, getActiveStoreRepo, location.pathname]);

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

  // Listen to data changes that affect the current search source
  useEffect(() => {
    const handleSearchSourceUpdated = () => {
      loadSearchItems();
    };

    window.addEventListener('skills-updated', handleSearchSourceUpdated);
    window.addEventListener('favorites-updated', handleSearchSourceUpdated);
    window.addEventListener('distributed-updated', handleSearchSourceUpdated);
    window.addEventListener('store-repos-updated', handleSearchSourceUpdated);

    return () => {
      window.removeEventListener('skills-updated', handleSearchSourceUpdated);
      window.removeEventListener('favorites-updated', handleSearchSourceUpdated);
      window.removeEventListener('distributed-updated', handleSearchSourceUpdated);
      window.removeEventListener('store-repos-updated', handleSearchSourceUpdated);
    };
  }, [loadSearchItems]);

  const handleSelectSkill = (item: SearchItem) => {
    setSearchQuery('');
    setShowDropdown(false);

    if (item.highlightName) {
      sessionStorage.setItem('highlight-skill', item.highlightName);
    }

    if (location.pathname === item.targetPath && item.highlightName) {
      window.dispatchEvent(new CustomEvent('highlight-skill', { detail: { skillName: item.highlightName } }));
      return;
    }

    navigate(item.targetPath);
  };

  const filteredSkills = searchItems.filter(skill => 
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
              loadSearchItems();
              setShowDropdown(true);
            }}
          />
        </div>

        {showDropdown && searchQuery && (
          <div className="search-dropdown">
            {loadingSearch ? (
              <div className="search-no-results">搜索中...</div>
            ) : filteredSkills.length === 0 ? (
              <div className="search-no-results">没有找到匹配的 skill</div>
            ) : (
              filteredSkills.map((skill, index) => (
                <div 
                  key={index} 
                  className="search-dropdown-item focus:outline-none"
                  style={{ outline: 'none' }}
                  onClick={() => handleSelectSkill(skill)}
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
