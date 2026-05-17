import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, UploadCloud } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';
import { invoke } from '@tauri-apps/api/core';
import { appDataDir, join } from '@tauri-apps/api/path';
import { UploadSkillModal } from '../components/modals/UploadSkillModal';

interface SkillInfo {
  name: string;
  description: string | null;
}

export function Pending() {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<string>('');
  const navigate = useNavigate();

  const fetchPendingSkills = async () => {
    try {
      setLoading(true);
      let dataPath = localStorage.getItem('skillhub-data-path');
      if (!dataPath) {
        const baseDir = await appDataDir();
        dataPath = await join(baseDir, 'SkillsHub');
      }
      const result: SkillInfo[] = await invoke('get_local_skills', { dataPath });
      
      const storedDistributed = localStorage.getItem('skillhub-distributed');
      const distributedList: { name: string }[] = storedDistributed ? JSON.parse(storedDistributed) : [];
      const distributedNames = distributedList.map(d => d.name);
      
      const pendingSkills = result.filter(skill => !distributedNames.includes(skill.name));
      setSkills(pendingSkills);
    } catch (error) {
      console.error('Failed to fetch pending skills:', error);
    } finally {
      setLoading(false);
    }
  };

  const highlightSkill = (skillName: string) => {
    setTimeout(() => {
      const card = document.getElementById(`skill-card-${skillName}`);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.add('highlighted-skill-card');
        setTimeout(() => {
          card.classList.remove('highlighted-skill-card');
        }, 4500);
      }
    }, 150);
  };

  useEffect(() => {
    fetchPendingSkills();
    window.addEventListener('distributed-updated', fetchPendingSkills);
    return () => {
      window.removeEventListener('distributed-updated', fetchPendingSkills);
    };
  }, []);

  // Listen to highlight-skill event
  useEffect(() => {
    const handleHighlight = (e: Event) => {
      const skillName = (e as CustomEvent).detail?.skillName;
      if (skillName) {
        highlightSkill(skillName);
      }
    };
    window.addEventListener('highlight-skill', handleHighlight);
    return () => {
      window.removeEventListener('highlight-skill', handleHighlight);
    };
  }, [skills]);

  // Check sessionStorage for pending highlight on load
  useEffect(() => {
    if (!loading && skills.length > 0) {
      const targetSkill = sessionStorage.getItem('highlight-skill');
      if (targetSkill) {
        highlightSkill(targetSkill);
        sessionStorage.removeItem('highlight-skill');
      }
    }
  }, [loading, skills]);

  const handleUploadClick = (e: React.MouseEvent, skillName: string) => {
    e.stopPropagation();
    setSelectedSkill(skillName);
    setUploadModalOpen(true);
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <div className="page-title">
            <Clock size={24} className="text-primary" style={{ color: 'var(--color-primary)' }} />
            <h1 className="text-h1">待分发</h1>
            <span className="badge" style={{ backgroundColor: '#f1f5f9', color: '#64748b', fontSize: '0.875rem', padding: '0.125rem 0.5rem' }}>{skills.length}</span>
          </div>
          <p className="page-subtitle">本地的skill，代表可以push到公司Gerrit或个人github。</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12 text-secondary">加载中...</div>
      ) : skills.length === 0 ? (
        <EmptyState title="暂无待分发技能" description="你的所有本地技能都已经分发" />
      ) : (
        <div className="skills-grid">
          {skills.map((skill, index) => (
            <div 
              key={index} 
              id={`skill-card-${skill.name}`}
              className="skill-card hover-pointer group" 
              onClick={() => navigate(`/skill/${skill.name}`)}
            >
              <div className="skill-card-header">
                <div className="skill-card-icon">
                  {skill.name.charAt(0).toUpperCase()}
                </div>
                <div className="skill-card-actions opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                  <button 
                    className="skill-action-btn flex items-center gap-1 focus:outline-none bg-primary/10 text-primary hover:bg-primary/20 px-2 rounded-md" 
                    title="上传"
                    onClick={(e) => handleUploadClick(e, skill.name)}
                    style={{ outline: 'none', border: 'none' }}
                  >
                    <UploadCloud size={14} />
                    <span className="text-xs font-medium">上传</span>
                  </button>
                </div>
              </div>

              <h3 className="skill-card-title">{skill.name}</h3>

              <p className="skill-card-desc">
                {skill.description || '暂无描述'}
              </p>
            </div>
          ))}
        </div>
      )}

      {uploadModalOpen && (
        <UploadSkillModal 
          isOpen={uploadModalOpen} 
          onClose={() => setUploadModalOpen(false)} 
          skillName={selectedSkill} 
        />
      )}
    </div>
  );
}
