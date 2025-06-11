import { create } from 'zustand';
import { ProjectData, Label } from '../app/types';

// Simple locking mechanism to prevent multiple fetches
let hasFetched = false;
let isFetching = false;

interface ProjectState {
  isAuthenticated: boolean | null;
  allProjects: ProjectData[];
  availableLabels: Label[];
  activeProjects: Record<string, boolean>;
  isLoading: boolean;
  error: string | null;
  
  checkAuthStatus: () => Promise<void>;
  logout: () => Promise<void>;
  fetchInitialData: () => Promise<void>;
  handleDeleteProject: (id: number, name: string) => Promise<void>;
  saveOrder: (orderedIds: number[], reorderedProjects: ProjectData[]) => Promise<void>;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  isAuthenticated: null,
  allProjects: [],
  availableLabels: [],
  activeProjects: {},
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
    if (hasFetched || isFetching) {
      return;
    }
    isFetching = true;
    set({ isLoading: true, error: null });

    try {
      const [projectRes, labelsRes] = await Promise.all([ fetch('/api/projects'), fetch('/api/labels') ]);
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
      hasFetched = true;
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    } finally {
      isFetching = false;
    }
  },

  handleDeleteProject: async (id: number, name: string) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"?`)) return;
    set({ error: null });
    try {
        const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error || 'Failed to delete project');
        }
        set(state => ({ allProjects: state.allProjects.filter(p => p.id !== id) }));
    } catch (e: any) {
        console.error('Delete failed:', e);
        set({ error: e.message });
    }
  },

  saveOrder: async (orderedIds: number[], reorderedProjects: ProjectData[]) => {
    const previousOrder = get().allProjects;
    set({ allProjects: reorderedProjects, error: null });
    try {
        const res = await fetch('/api/projects/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderedIds }) });
        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error || 'Failed to save order');
        }
    } catch (e: any) {
        console.error('Save order failed:', e);
        set({ error: e.message, allProjects: previousOrder });
    }
  },
}));
