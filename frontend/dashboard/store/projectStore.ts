// frontend/dashboard/store/projectStore.ts
import { create } from 'zustand';
import { ProjectData, Label } from '../app/types';

interface ProjectState {
  // State
  allProjects: ProjectData[];
  availableLabels: Label[];
  activeProjects: Record<string, boolean>;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchInitialData: () => Promise<void>;
  updateStatusFromSocket: (projectName: string, isRunning: boolean) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  // Initial State
  allProjects: [],
  availableLabels: [],
  activeProjects: {},
  isLoading: true,
  error: null,

  // Actions
  fetchInitialData: async () => {
    set({ isLoading: true, error: null });
    try {
      const [projectRes, labelsRes] = await Promise.all([
        fetch('/api/projects'),
        fetch('/api/labels'),
      ]);

      if (!projectRes.ok) throw new Error('Failed to fetch projects');
      if (!labelsRes.ok) throw new Error('Failed to fetch labels');

      const projectsData: ProjectData[] = await projectRes.json();
      const labelsData: Label[] = await labelsRes.json();
      const initialStatuses: Record<string, boolean> = {};

      if (projectsData.length > 0) {
        const statusPromises = projectsData.map(p =>
          fetch('/api/check-project', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ port: p.port })
          }).then(res => res.json()).then(data => ({ name: p.project_name, running: data.running }))
          .catch(() => ({ name: p.project_name, running: false }))
        );
        const statuses = await Promise.all(statusPromises);
        statuses.forEach(s => { initialStatuses[s.name] = s.running; });
      }
      set({ allProjects: projectsData, availableLabels: labelsData, activeProjects: initialStatuses, isLoading: false });

    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },
  
  updateStatusFromSocket: (projectName, isRunning) => {
    set(state => ({
        activeProjects: { ...state.activeProjects, [projectName]: isRunning },
        // The public dashboard doesn't need to manage the 'starting' set
    }));
  },
}));
