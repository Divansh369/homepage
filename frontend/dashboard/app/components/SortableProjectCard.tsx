"use client";

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ProjectData } from '../types';
import { Rocket, Edit, Trash2, Power, PowerOff, Loader } from 'lucide-react';

interface SortableProjectCardProps {
  isAuthenticated: boolean;
  project: ProjectData;
  isRunning: boolean;
  isStarting: boolean;
  isEditMode: boolean;
  handleStartProject: (name: string) => void;
  handleStopProject: (name: string) => void;
  handleOpenProject: (scheme: 'http' | 'https', host: string, port: string) => void;
  handleDeleteProject: (id: number, name: string) => void;
}

export function SortableProjectCard({
  isAuthenticated,
  project,
  isRunning,
  isStarting,
  isEditMode,
  handleStartProject,
  handleStopProject,
  handleOpenProject,
  handleDeleteProject
}: SortableProjectCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: project.id, disabled: !isEditMode });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.8 : 1, zIndex: isDragging ? 10 : 'auto', cursor: isEditMode ? 'grab' : 'default' };
  const dndListeners = isEditMode ? listeners : undefined;

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...dndListeners} className={`project-card ${isDragging ? 'dragging' : ''}`}>
        
        {isAuthenticated && !isEditMode && (
            <div className="card-header-actions">
                <Link href={`/edit-project/${project.id}`} className="card-icon-button" title="Edit">
                    <Edit size={16} />
                </Link>
                <button onClick={() => handleDeleteProject(project.id, project.project_name)} className="card-icon-button" title="Delete">
                    <Trash2 size={16} />
                </button>
            </div>
        )}
        
        {project.icon_path && !project.icon_path.endsWith('default.png') && ( 
             <Image 
                className="project-icon" 
                src={project.icon_path} 
                alt={`${project.project_name} Icon`} 
                width={50} 
                height={50} 
                priority={false} 
                unoptimized={true} 
                crossOrigin="anonymous"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} 
             /> 
        )}
        
        <h2>{project.project_name}</h2>
        <p className="project-description">{project.description || 'No description provided.'}</p>
        <div className="label-icons">{project.cards.map((card) => (<div key={card.label_id} className="tooltip"><Image className="label-icon" src={`/label_icons/${card.label_name}.png`} alt={`${card.label_name} Icon`} width={30} height={30} onError={(e) => { (e.target as HTMLImageElement).src = '/label_icons/default.png'; }} /><span className="tooltiptext">{card.label_name}</span></div>))}</div>
        
        <div className="project-actions">
            {isRunning ?
                <button className="action-button open-button" onClick={() => handleOpenProject(project.scheme, project.host, project.port)} title="Open Project">
                    <Rocket size={16} style={{marginRight: '6px'}}/> Open
                </button>
            : (
                <button className="action-button" disabled>Not Running</button>
            )}

            {isAuthenticated && (
                isStarting ? (
                     <button className="action-button" disabled style={{minWidth: '100px'}}>
                        <Loader size={16} className="spinner"/> Starting...
                    </button>
                ) : isRunning ? (
                     <button className="action-button stop-button" onClick={() => handleStopProject(project.project_name)} disabled={isEditMode} title="Stop Project">
                        <PowerOff size={16} style={{marginRight: '6px'}}/> Stop
                    </button>
                ) : (
                    <button className="action-button start-button" onClick={() => handleStartProject(project.project_name)} disabled={isEditMode} title="Start Project">
                        <Power size={16} style={{marginRight: '6px'}}/> Start
                    </button>
                )
            )}
        </div>
        
        <div className={`status-indicator ${isRunning ? 'running' : (isStarting ? 'pending' : 'stopped')}`}>
            {isStarting ? 'Pending' : (isRunning ? 'Running' : 'Stopped')} on {project.host}:{project.port}
        </div>
    </div>
  );
}
