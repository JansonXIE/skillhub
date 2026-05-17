import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Globe, Server } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';
import { invoke } from '@tauri-apps/api/core';
import { appDataDir, join } from '@tauri-apps/api/path';

interface SkillInfo {
  name: string;
  description: string | null;
}

interface DistributedMeta {
  name: string;
  repoId: string;
  repoUrl: string;
  timestamp: number;
}

export function Distributed() {
  const [skills, setSkills] = useState<(SkillInfo & { meta: DistributedMeta })[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchDistributedSkills = async () => {
    try {
      setLoading(true);
      let dataPath = localStorage.getItem('skillhub-data-path');
      if (!dataPath) {
        const baseDir = await appDataDir();
        dataPath = await join(baseDir, 'SkillsHub');
      }
      const result: SkillInfo[] = await invoke('get_local_skills', { dataPath });
      
      const storedDistributed = localStorage.getItem('skillhub-distributed');
      const distributedList: DistributedMeta[] = storedDistributed ? JSON.parse(storedDistributed) : [];
      
      const distributedSkills = result
        .map(skill => {
          const meta = distributedList.find(d => d.name === skill.name);
          return meta ? { ...skill, meta } : null;
        })
        .filter(Boolean) as (SkillInfo & { meta: DistributedMeta })[];
        
      setSkills(distributedSkills);
    } catch (error) {
      console.error('Failed to fetch distributed skills:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDistributedSkills();
    window.addEventListener('distributed-updated', fetchDistributedSkills);
    return () => {
      window.removeEventListener('distributed-updated', fetchDistributedSkills);
    };
  }, []);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <div className="page-title">
            <Globe size={24} className="text-primary" style={{ color: 'var(--color-primary)' }} />
            <h1 className="text-h1">已分发</h1>
            <span className="badge" style={{ backgroundColor: '#f1f5f9', color: '#64748b', fontSize: '0.875rem', padding: '0.125rem 0.5rem' }}>{skills.length}</span>
          </div>
          <p className="page-subtitle">自己已经提交到公司Gerrit或个人github中的skill。</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12 text-secondary">加载中...</div>
      ) : skills.length === 0 ? (
        <EmptyState title="暂无已分发技能" description="将本地技能分发到远程仓库" />
      ) : (
        <div className="skills-grid">
          {skills.map((skill, index) => (
            <div key={index} className="skill-card hover-pointer group" onClick={() => navigate(`/skill/${skill.name}`)}>
              <div className="skill-card-header">
                <div className="skill-card-icon">
                  {skill.name.charAt(0).toUpperCase()}
                </div>
              </div>

              <h3 className="skill-card-title">{skill.name}</h3>

              <p className="skill-card-desc mb-3">
                {skill.description || '暂无描述'}
              </p>
              
              <div className="mt-auto pt-3 border-t border-border/50 flex items-center gap-1.5 text-xs text-secondary">
                <Server size={12} />
                <span className="truncate" title={skill.meta.repoUrl}>
                  {skill.meta.repoUrl}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
