// frontend/app/components/ProjectGrid.tsx
"use client";

import React from 'react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableProjectCard } from './SortableProjectCard';
import { ProjectData } from '../types';

interface ProjectGridProps {
  isAuthenticated: boolean; // <-- NEW
  projects: ProjectData[];
  setProjects: React.Dispatch<React.SetStateAction<ProjectData[]>>;
  activeProjects: Record<string, boolean>;
  startingProjects: Set<string>;
  isEditMode: boolean;
  handleStartProject: (name: string) => void;
  handleStopProject: (name: string) => void;
  handleOpenProject: (scheme: 'http' | 'https', host: string, port: string) => void;
  handleDeleteProject: (id: number, name: string) => void;
}

export function ProjectGrid({ projects, setProjects, activeProjects, startingProjects, isEditMode, ...handlers }: ProjectGridProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setProjects((items) => {
        const oldIndex = items.findIndex((p) => p.id === active.id);
        const newIndex = items.findIndex((p) => p.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={projects.map(p => p.id)} strategy={verticalListSortingStrategy}>
        <div className="project-cards-container">
          {projects.map((project) => {
            const isRunning = activeProjects[project.project_name] ?? false;
            const isStarting = startingProjects.has(project.project_name);
            return (
              <SortableProjectCard
                key={project.id}
                project={project}
                isRunning={isRunning}
                isStarting={isStarting}
                isEditMode={isEditMode}
                {...handlers} // handlers object already includes isAuthenticated
              />
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}
