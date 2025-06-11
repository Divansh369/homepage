// frontend/dashboard/app/components/ProjectCard.tsx
"use client";

import React from 'react';
import Image from 'next/image';
import { ProjectData } from '../types';
import { Rocket, Power, PowerOff, Loader } from 'lucide-react'; // No longer need Edit/Trash

interface ProjectCardProps {
  project: ProjectData;
  isRunning: boolean;
  onCardClick: () => void; // Function to open the modal
  handleOpenProject: (scheme: 'http' | 'https', host: string, port: string) => void;
}

export function ProjectCard({
  project,
  isRunning,
  onCardClick,
  handleOpenProject
}: ProjectCardProps) {

  // Stop the card click from propagating when a button inside it is clicked
  const onButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    // The entire card is now clickable to open the modal
    <div className="project-card" onClick={onCardClick} style={{ cursor: 'pointer' }}>
        {project.icon_path && ( 
             <Image 
                className="project-icon" 
                src={project.icon_path} 
                alt={`${project.project_name} Icon`} 
                width={50} height={50}
                unoptimized={true} 
                crossOrigin="anonymous"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} 
             /> 
        )}
        
        <h2>{project.project_name}</h2>
        <p className="project-description">{project.description || 'No description provided.'}</p>
        <div className="label-icons">{project.cards.map((card) => (
            <div key={card.label_id} className="tooltip">
                <Image className="label-icon" src={`/label_icons/${card.label_name}.png`} alt={`${card.label_name} Icon`} width={30} height={30} />
                <span className="tooltiptext">{card.label_name}</span>
            </div>
        ))}</div>
        
        <div className="project-actions" onClick={onButtonClick}>
            {isRunning ?
                <button className="action-button open-button" onClick={() => handleOpenProject(project.scheme, project.host, project.port)}>
                    <Rocket size={16} style={{marginRight: '6px'}}/> Open
                </button>
            : (
                <button className="action-button" disabled>Not Running</button>
            )}
        </div>
        
        <div className={`status-indicator ${isRunning ? 'running' : 'stopped'}`}>
            {isRunning ? 'Running' : 'Stopped'}
        </div>
    </div>
  );
}
