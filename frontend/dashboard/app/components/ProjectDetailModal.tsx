// frontend/dashboard/app/components/ProjectDetailModal.tsx
"use client";

import { ProjectData } from '../types';
import { X, ExternalLink, Github } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface ProjectDetailModalProps {
  project: ProjectData | null;
  onClose: () => void;
}

export function ProjectDetailModal({ project, onClose }: ProjectDetailModalProps) {
  if (!project) {
    return null;
  }

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Close modal if the backdrop (the semi-transparent background) is clicked
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal-content">
        <header className="modal-header">
          <h2>{project.project_name}</h2>
          <button onClick={onClose} className="modal-close-button" aria-label="Close modal">
            <X size={28} />
          </button>
        </header>

        <div className="modal-body">
            {(project.github_url || project.deployed_url) && (
                 <div className="detail-section modal-links">
                    {project.github_url && (
                        <a href={project.github_url} target="_blank" rel="noopener noreferrer" className="modal-link">
                            <Github size={16} /> GitHub Repository
                        </a>
                    )}
                    {project.deployed_url && (
                         <a href={project.deployed_url} target="_blank" rel="noopener noreferrer" className="modal-link">
                            <ExternalLink size={16} /> Deployed App
                        </a>
                    )}
                 </div>
            )}
           

            {project.description && (
                <div className="detail-section">
                    <h3>Description</h3>
                    <p>{project.description}</p>
                </div>
            )}
            
            {project.notes && (
                <div className="detail-section">
                    <h3>Notes</h3>
                    <div className="modal-notes">
                        <ReactMarkdown>{project.notes}</ReactMarkdown>
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
}
