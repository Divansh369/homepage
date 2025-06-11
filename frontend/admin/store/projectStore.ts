// frontend/store/projectStore.ts
import { create } from 'zustand';
import { ProjectData, Label } from '../app/types';
import { shallow } from 'zustand/shallow';

interface ProjectState {
  isAuthenticated: boolean | null;
  allProjects: ProjectData[];
  availableLabels: Label[];
  activeProjects: Record<string, boolean>;
  startingProjects: Set<string>;
  isLoading: boolean;
  error: string | null;

  checkAuthStatus: () => Promise<void>;
  logout: () => Promise<void>;
  fetchInitialData: () => Promise<void>;
  handleStartProject: (projectName: string) => Promise<void>;
  handleStopProject: (projectName: string) => Promise<void>;
  handleDeleteProject: (id: number, name: string) => Promise<void>;
  saveOrder: (orderedIds: number[], reorderedProjects: ProjectData[]) => Promise<void>;
  
  setAllProjects: (projects: ProjectData[]) => void;
  updateStatusFromSocket: (projectName: string, isRunning: boolean) => void;
}

export const useAuth = () => useProjectStore(state => ({
  isAuthenticated: state.isAuthenticated,
  checkAuthStatus: state.checkAuthStatus
}), shallow);


export const useProjectStore = create<ProjectState>((set, get) => ({
  isAuthenticated: null,
  allProjects: [],
  availableLabels: [],
  activeProjects: {},
  startingProjects: new Set(),
  isLoading: true,
  error: null,

  checkAuthStatus: async () => {
    try {
      const res = await fetch('/api/auth/status');
      if (!res.ok) throw new Error("Auth check request failed");
      const data = await res.json();
      set({ isAuthenticated: data.isAuthenticated });
    } catch (e) {
      console.error("Auth check failed:", e);
      set({ isAuthenticated: false });
    }
  },

  logout: async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
    } catch (e) {
      console.error("Logout failed:", e);
    } finally {
      set({ isAuthenticated: false });
    }
  },

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
  
  handleStartProject: async (projectName: string) => {
    const { startingProjects, activeProjects } = get();
    if (startingProjects.has(projectName) || activeProjects[projectName]) return;
    set({ startingProjects: new Set(startingProjects).add(projectName) });
    try {
      const res = await fetch('/api/start-project', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectName }) });
      if (!res.ok) throw new Error(await res.text());
    } catch (e: any) {
      console.error("Error starting project:", e);
      set(state => ({ error: `Failed to start ${projectName}`, startingProjects: new Set([...state.startingProjects].filter(p => p !== projectName)) }));
    }
  },

  handleStopProject: async (projectName: string) => {
    try {
        await fetch('/api/stop-project', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectName }) });
    } catch (e) { console.error("Error stopping project:", e); }
  },

  handleDeleteProject: async (id: number, name: string) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"? This cannot be undone.`)) return;
    try {
        const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error((await res.json()).error || 'Delete failed');
        set(state => ({ allProjects: state.allProjects.filter(p => p.id !== id) }));
    } catch (e: any) { console.error("Error deleting project:", e); }
  },

  saveOrder: async (orderedIds: number[], reorderedProjects: ProjectData[]) => {
    const previousOrder = get().allProjects;
    set({ allProjects: reorderedProjects });
    try {
        const res = await fetch('/api/projects/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderedIds }) });
        if (!res.ok) throw new Error((await res.json()).error || 'Save order failed');
    } catch (e: any) {
        console.error("Error saving order:", e);
        set({ allProjects: previousOrder }); // Revert on failure
    }
  },
  
  setAllProjects: (projects: ProjectData[]) => set({ allProjects: projects }),

  updateStatusFromSocket: (projectName, isRunning) => {
    set(state => ({
        activeProjects: { ...state.activeProjects, [projectName]: isRunning },
        startingProjects: new Set([...state.startingProjects].filter(p => p !== projectName))
    }));
  },
}));
