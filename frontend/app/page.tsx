// frontend/app/page.tsx
"use client";

import React, { useEffect, useState, useRef, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import type { MultiValue } from 'react-select';
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTheme } from './ThemeContext';
import { GripVertical } from 'lucide-react';

const Select = dynamic(() => import('react-select'), {
  ssr: false,
  loading: () => <div className='filter-select filter-multiselect navbar-control' style={{ minHeight: '38px', display: 'flex', alignItems: 'center', color: '#aaa', paddingLeft: '10px' }}>Loading...</div>
});

interface LabelInfo { label_id: string; label_name: string; label_type: string; }
interface ProjectData {
  project_name: string; description: string; icon_filename: string; icon_path: string;
  startup_script: string; port: string; scheme: 'http' | 'https'; host: string;
  labels: LabelInfo[];
}
interface FullLabel { id: string; name: string; label_type: string; }
interface InitialStatusResult { name: string; running: boolean; projectData?: ProjectData; }
interface SelectOption { value: string; label: string; }

const POLLING_INTERVAL = 5000;
const FIXED_HOST_FOR_CUSTOM_PORT = process.env.NEXT_PUBLIC_FIXED_HOST || '100.94.150.11';

interface SortableProjectCardProps {
    project: ProjectData;
    isRunning: boolean;
    isStarting: boolean;
    isEditMode: boolean;
    onStart: (projectName: string) => void;
    onStop: (projectName: string) => void;
    onOpen: (scheme: 'http' | 'https', host: string, port: string) => void;
}

function SortableProjectCard({ project, isRunning, isStarting, isEditMode, onStart, onStop, onOpen }: SortableProjectCardProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: project.project_name });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.85 : 1,
        zIndex: isDragging ? 1000 : 'auto', // Ensure dragged item is on top
    };

    const handleActionClick = (e: React.MouseEvent, action: () => void) => {
        if (isEditMode) {
            e.preventDefault(); // Prevent button actions in edit mode
            // Allow event to propagate for DND if click is on draggable area
        } else {
            action();
        }
    };
    
    return (
        <div 
            ref={setNodeRef} 
            style={style} 
            className={`project-card ${isDragging ? 'dragging' : ''} ${isEditMode ? 'edit-mode-card' : 'no-drag'}`} // Add 'edit-mode-card' for clarity
            // Apply DND attributes and listeners directly to the card div when in edit mode
            {...(isEditMode ? attributes : {})} 
            {...(isEditMode ? listeners : {})}
        >
          {isEditMode && !isDragging && (
             <div className="drag-handle-button" aria-label={`Drag ${project.project_name}`}> {/* This is now mainly a VISUAL CUE */}
                 <GripVertical size={20} />
             </div>
          )}
          <h2>{project.project_name}</h2>
          <div className="project-icon-container">
            {project.icon_path && project.icon_path !== '/label_icons/default.png' && (
              <Image className="project-icon" src={project.icon_path} alt={`${project.project_name} Icon`} width={48} height={48} priority={false} unoptimized={true} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}/>
            )}
          </div>
          <p className="project-description">{project.description || 'No description provided.'}</p>
          <div className="label-icons">
            {(project.labels || []).map((label) => (
              <div key={label.label_id} className="tooltip">
                <Image className="label-icon" src={`/label_icons/${label.label_name.replace(/[^a-zA-Z0-9.-]/g, '_')}.png`} alt={`${label.label_name} Icon`} width={22} height={22} onError={(e) => { (e.target as HTMLImageElement).src = '/label_icons/default.png'; }}/>
                <span className="tooltiptext">{label.label_name}</span>
              </div>
            ))}
          </div>
          <div className="project-actions">
            {isStarting? (<button className="action-button start-button" disabled><span className="spinner"></span> Starting...</button>)
            : isRunning ? (<button className="action-button open-button" onClick={(e)=>handleActionClick(e,()=>onOpen(project.scheme,project.host,project.port))} disabled={isEditMode} title={`Open`}>🚀 Open</button>)
            : (<button className="action-button start-button" onClick={(e)=>handleActionClick(e,()=>onStart(project.project_name))} disabled={isStarting || isEditMode}>▶️ Start</button>)}
            <button className="action-button stop-button" onClick={(e)=>handleActionClick(e,()=>onStop(project.project_name))} disabled={!isRunning || isStarting || isEditMode} title="Stop">⏹️ Stop</button>
            <Link href={`/project/${encodeURIComponent(project.project_name)}`} passHref legacyBehavior>
                <a className={`action-button details-button ${isEditMode ? 'disabled-link' : ''}`} onClick={(e)=>{ if (isEditMode) e.preventDefault();}} aria-disabled={isEditMode}>⚙️ Details</a>
            </Link>
          </div>
          <div className={`status-indicator ${isRunning?'running':(isStarting?'pending':'stopped')}`}>
            {isStarting?'Pending':(isRunning?'Running':'Stopped')} on {project.host}:{project.port}
          </div>
        </div>
    );
}

const dragHandleButtonCSS = `
.drag-handle-button {
  position: absolute;
  top: 15px; 
  right: 15px; 
  background: rgba(128,128,128,0.08);
  border: 1px solid rgba(128,128,128,0.15);
  border-radius: 50%;
  padding: 5px;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  /* cursor: grab; // Not needed if whole card is the grab target */
  z-index: 5; 
  color: var(--color-text);
  transition: background-color 0.2s ease, transform 0.15s ease;
}
/* If you want to hide the visual cue when not in edit mode (though it is now) */
/* .project-card:not(.edit-mode-card) .drag-handle-button { display: none; } */
`;


export default function Home() {
    const [projects, setProjects] = useState<ProjectData[]>([]);
    const [orderedProjectIds, setOrderedProjectIds] = useState<string[]>([]);
    const [filteredAndOrderedProjects, setFilteredAndOrderedProjects] = useState<ProjectData[]>([]);
    const [selectedLanguageOptions, setSelectedLanguageOptions] = useState<MultiValue<SelectOption>>([]);
    const [selectedUtilityOptions, setSelectedUtilityOptions] = useState<MultiValue<SelectOption>>([]);
    const [availableLabels, setAvailableLabels] = useState<FullLabel[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [activeProjects, setActiveProjects] = useState<Record<string, boolean>>({});
    const [startingProjects, setStartingProjects] = useState<Set<string>>(new Set());
    const [projectJustStarted, setProjectJustStarted] = useState<ProjectData | null>(null);
    const [customPort, setCustomPort] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [searchTerm, setSearchTerm] = useState<string>('');
    const [showOnlyActive, setShowOnlyActive] = useState<boolean>(false);
    const [isEditMode, setIsEditMode] = useState<boolean>(false);

    const { theme, toggleTheme } = useTheme();
    const projectsRef = useRef<ProjectData[]>(projects);
    const activeProjectsRef = useRef<Record<string,boolean>>(activeProjects);
    const startingProjectsRef = useRef<Set<string>>(startingProjects);

    useEffect(() => { projectsRef.current = projects; }, [projects]);
    useEffect(() => { activeProjectsRef.current = activeProjects; }, [activeProjects]);
    useEffect(() => { startingProjectsRef.current = startingProjects; }, [startingProjects]);

    const getLanguageOptions = useCallback((labels: FullLabel[]): SelectOption[] => (labels || []).filter(l => l.label_type === 'language').map(l => ({ value: l.id, label: l.name })), []);
    const getUtilityOptions = useCallback((labels: FullLabel[]): SelectOption[] => (labels || []).filter(l => l.label_type === 'utility').map(l => ({ value: l.id, label: l.name })), []);

    const fetchLabels = useCallback(async () => {
        try {
            const r = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/labels`);
            if (!r.ok) throw new Error(`Fetch labels failed: ${r.status}`);
            const d: FullLabel[] = await r.json();
            if (!Array.isArray(d)) throw new Error("Invalid label data format.");
            setAvailableLabels(d);
        } catch (e: any) {
            console.error("Fetch labels error:", e);
            setError(prev => prev ? `${prev}, Labels fetch fail: ${e.message}` : `Labels fetch fail: ${e.message}`);
            setAvailableLabels([]);
        }
    }, []);

    const fetchProjectsAndStatus = useCallback(async (isInitialLoad = false) => {
        if (isInitialLoad) setIsLoading(true);
        try {
            const projectsResponse = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/projects`);
            if (!projectsResponse.ok) throw new Error(`Projects fetch failed ${projectsResponse.status}: ${await projectsResponse.text()}`);
            let fetchedProjects: ProjectData[] = await projectsResponse.json();
            if (!Array.isArray(fetchedProjects)) throw new Error("Invalid project data format from backend.");

            fetchedProjects = fetchedProjects.map(p => ({
                ...p,
                labels: Array.isArray(p.labels) ? p.labels : [],
                description: p.description || '',
            }));

            setProjects(fetchedProjects);
            if (isInitialLoad || orderedProjectIds.length === 0 || fetchedProjects.length !== projectsRef.current.length) {
                setOrderedProjectIds(fetchedProjects.map(p => p.project_name));
            }

            if (isInitialLoad && fetchedProjects.length > 0) {
                const statusPromises = fetchedProjects.map(async (p): Promise<InitialStatusResult> => {
                    if (!p?.project_name || !p.port) return { name: p?.project_name || 'unknown_initial', running: false };
                    try {
                        const statusRes = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/check-project`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({port: p.port}) });
                        return { name: p.project_name, running: statusRes.ok ? (await statusRes.json()).running : false };
                    } catch { return { name: p.project_name, running: false }; }
                });
                const results = await Promise.all(statusPromises);
                setActiveProjects(results.reduce((acc, s) => { if (s.name !== 'unknown_initial') acc[s.name] = s.running; return acc; }, {} as Record<string, boolean>));
            }
        } catch(e:any) {
            console.error("Fetch projects & status error:", e);
            setError(prev => prev ? `${prev}, Projects/Status fetch fail: ${e.message}` : `Projects/Status fetch fail: ${e.message}`);
        } finally {
            if (isInitialLoad) setIsLoading(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orderedProjectIds.length]);


    useEffect(() => {
        const loadData = async () => {
          setIsLoading(true); setError(null);
          await fetchLabels();
          await fetchProjectsAndStatus(true);
          setIsLoading(false);
          console.log("🚀 Initial data loaded.");
        };
        loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const checkAllProjectsStatus = useCallback(async () => {
        const currentProjs = projectsRef.current;
        if (!currentProjs || currentProjs.length === 0 || !navigator.onLine) return;
        const currentStartProjs = startingProjectsRef.current;
        let projectThatJustStarted: ProjectData | null = null;
        let statusesChanged = false;
        const newActiveStatuses = { ...activeProjectsRef.current };

        for (const proj of currentProjs) {
            if (!proj?.project_name || !proj.port) continue;
            try {
                const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/check-project`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ port: proj.port }) });
                const data = response.ok ? await response.json() : { running: newActiveStatuses[proj.project_name] || false };
                const prevStatus = newActiveStatuses[proj.project_name];
                if (data.running !== prevStatus) {
                    newActiveStatuses[proj.project_name] = data.running;
                    statusesChanged = true;
                    if (data.running && currentStartProjs.has(proj.project_name)) projectThatJustStarted = proj;
                }
            } catch (e) { /* Silent fail for polling */ }
        }
        if (statusesChanged) setActiveProjects(newActiveStatuses);
        if (projectThatJustStarted) {
            setProjectJustStarted(projectThatJustStarted);
            setStartingProjects(prev => { const next = new Set(prev); next.delete(projectThatJustStarted!.project_name); return next; });
        }
    }, []);

    const handleOpenProjectWindow = useCallback((scheme: 'http' | 'https', host: string, port: string) => {
        if (isEditMode) return;
        try {
            const portNum = parseInt(port, 10); let url = `${scheme}://${host.includes(':') && !host.startsWith('[') ? `[${host}]` : host}`;
            if (!isNaN(portNum) && !((scheme === 'http' && portNum === 80) || (scheme === 'https' && portNum === 443))) url += `:${port}`;
            window.open(url, '_blank', 'noopener,noreferrer');
        } catch (err: any) { setError(`Failed to open: ${err.message}`); }
    }, [isEditMode]);

    useEffect(() => { if (projectJustStarted) { handleOpenProjectWindow(projectJustStarted.scheme, projectJustStarted.host, projectJustStarted.port); setProjectJustStarted(null); } }, [projectJustStarted, handleOpenProjectWindow]);
    useEffect(() => { let id: NodeJS.Timeout | null = null; if (projects.length > 0 && !isLoading) { id = setInterval(checkAllProjectsStatus, POLLING_INTERVAL); } return () => { if (id) clearInterval(id); }; }, [projects, isLoading, checkAllProjectsStatus]);

    useEffect(() => {
        const currentLangs = new Set(selectedLanguageOptions.map(o => o.value));
        const currentUtils = new Set(selectedUtilityOptions.map(o => o.value));
        const search = searchTerm.toLowerCase().trim();
        const projectsMapByName = projects.reduce((map, proj) => { map[proj.project_name] = proj; return map; }, {} as Record<string, ProjectData>);
        const correctlyOrderedProjects = orderedProjectIds.map(id => projectsMapByName[id]).filter(Boolean);

        const finalFiltered = correctlyOrderedProjects.filter(proj => {
            if (!proj?.project_name) return false;
            if (showOnlyActive && !(activeProjectsRef.current[proj.project_name] || startingProjectsRef.current.has(proj.project_name))) return false;
            const nameMatch = proj.project_name.toLowerCase().includes(search);
            const descMatch = (proj.description || '').toLowerCase().includes(search);
            if (search && !nameMatch && !descMatch) return false;
            const labelIds = new Set((proj.labels || []).map(l => l.label_id));
            if (currentLangs.size > 0 && !Array.from(currentLangs).some(id => labelIds.has(id))) return false;
            if (currentUtils.size > 0 && !Array.from(currentUtils).some(id => labelIds.has(id))) return false;
            return true;
        });
        setFilteredAndOrderedProjects(finalFiltered);
    }, [searchTerm, selectedLanguageOptions, selectedUtilityOptions, projects, showOnlyActive, activeProjects, startingProjects, orderedProjectIds]);

    const handleMultiFilterChange = useCallback((selected: MultiValue<SelectOption>, type: 'language' | 'utility') => {
        if (type === 'language') setSelectedLanguageOptions(selected); else setSelectedUtilityOptions(selected);
    }, []);

    const handleStartProject = useCallback(async (projectName: string) => {
        if (isEditMode || startingProjectsRef.current.has(projectName) || activeProjectsRef.current[projectName]) return;
        setError(null); setStartingProjects(prev => new Set(prev).add(projectName));
        try {
            const r = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/start-project`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectName }), });
            if (r.status !== 202 && !r.ok) throw new Error(`Start failed ${r.status}: ${await r.text()}`);
        } catch (e: any) { setError(`Start ${projectName} fail: ${e.message}`); setStartingProjects(prev => { const next = new Set(prev); next.delete(projectName); return next; }); }
    }, [isEditMode]);

    const handleStopProject = useCallback(async (projectName: string) => {
        if (isEditMode) return; setError(null);
        try {
            const r = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/stop-project`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectName }), });
            const d = await r.json(); if (!r.ok) throw new Error(d.error || `Stop fail: ${r.status}`);
            setActiveProjects(p => ({ ...p, [projectName]: false })); if (startingProjectsRef.current.has(projectName)) setStartingProjects(prev => { const n = new Set(prev); n.delete(projectName); return n; });
        } catch (e: any) { setError(`Stop ${projectName} fail: ${e.message}`); const proj = projectsRef.current.find(p=>p.project_name===projectName); if(proj?.port) fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/check-project`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({port:proj.port})}).then(res=>res.json()).then(data=>setActiveProjects(p=>({...p,[projectName]:data.running}))).catch(console.warn);}
    }, [isEditMode]);

    const handleOpenCustomPort = useCallback(() => {
        if (isEditMode) return; setError(null); const port = customPort.trim();
        if (!port || !/^\d+$/.test(port)) { setError(!port ? "Enter port." : "Invalid format."); return; }
        window.open(`http://${FIXED_HOST_FOR_CUSTOM_PORT}:${port}`, '_blank', 'noopener,noreferrer'); setCustomPort('');
    }, [customPort, isEditMode]);

    const sensors = useSensors( useSensor(PointerSensor, { activationConstraint: { distance: 10 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }) );
    
    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const oldIndex = orderedProjectIds.indexOf(active.id as string);
            const newIndex = orderedProjectIds.indexOf(over.id as string);
            if (oldIndex === -1 || newIndex === -1) { console.warn("DND item not in ordered list"); return; }
            const newOrderIds = arrayMove(orderedProjectIds, oldIndex, newIndex);
            setOrderedProjectIds(newOrderIds);
            try {
                const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/projects/order`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderedProjectNames: newOrderIds }) });
                if (!response.ok) { const errData = await response.json(); throw new Error(errData.error || 'Backend save order failed.'); }
                console.log("Project order saved on backend.");
            } catch (err: any) { setError(`Save order fail: ${err.message}. UI may be out of sync.`); setOrderedProjectIds(arrayMove(newOrderIds, newIndex, oldIndex)); }
        }
    };
    
    const toggleEditMode = () => setIsEditMode(prev => !prev);

    return (
        <div className={`container ${theme} ${isEditMode ? 'edit-mode-active' : ''}`}>
            <style>{dragHandleButtonCSS}</style>
            <nav className="top-navbar">
                <div className="navbar-section filters-section">
                    <div className="filter-container search-container"><label htmlFor="project-search" className="filter-label">Search:</label><input type="search" id="project-search" className="navbar-control search-input" placeholder="Name or description..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} aria-label="Search projects" disabled={isEditMode}/></div>
                    <div className="filter-container react-select-container"><label htmlFor="language-filter-rs" className="filter-label">Language:</label><Select instanceId="language-filter-select" inputId='language-filter-rs' isMulti options={getLanguageOptions(availableLabels)} className="react-select-instance" classNamePrefix="react-select" value={selectedLanguageOptions} onChange={(s) => handleMultiFilterChange(s as MultiValue<SelectOption>, 'language')} placeholder="Languages..." isClearable={true} closeMenuOnSelect={false} isDisabled={isEditMode || isLoading || !availableLabels || availableLabels.length === 0} /></div>
                    <div className="filter-container react-select-container"><label htmlFor="utility-filter-rs" className="filter-label">Utility:</label><Select instanceId="utility-filter-select" inputId='utility-filter-rs' isMulti options={getUtilityOptions(availableLabels)} className="react-select-instance" classNamePrefix="react-select" value={selectedUtilityOptions} onChange={(s) => handleMultiFilterChange(s as MultiValue<SelectOption>, 'utility')} placeholder="Utilities..." isClearable={true} closeMenuOnSelect={false} isDisabled={isEditMode || isLoading || !availableLabels || availableLabels.length === 0}/></div>
                    <div className="filter-container active-filter-container"><label htmlFor="active-filter" className="filter-label">Active Only:</label><input type="checkbox" id="active-filter" className="active-filter-checkbox navbar-control" checked={showOnlyActive} onChange={(e) => setShowOnlyActive(e.target.checked)} disabled={isEditMode}/></div>
                </div>
                <div className="navbar-section custom-port-section"><div className="filter-container custom-port-opener"><label htmlFor="custom-port-input" className="filter-label">Open Port:</label><input type="text" id="custom-port-input" className="custom-port-input navbar-control" value={customPort} onChange={(e) => setCustomPort(e.target.value)} placeholder="Port" aria-label="Enter port number" disabled={isEditMode} /><button onClick={handleOpenCustomPort} className="action-button navbar-button open-custom-button" disabled={isEditMode || !customPort.trim()}>🔗</button></div></div>
                <div className="navbar-section edit-mode-section"><button onClick={toggleEditMode} className={`action-button navbar-button nav-edit-button ${isEditMode ? 'active' : ''}`} aria-pressed={isEditMode}>{isEditMode ? 'View Mode' : 'Edit Order'}</button></div>
                <div className="navbar-section add-buttons-section"><Link href="/add-label" className={`action-button navbar-button nav-add-button ${isEditMode ? 'disabled-link' : ''}`} aria-disabled={isEditMode} onClick={isEditMode ? (e)=>e.preventDefault() : undefined}>Add Label</Link><Link href="/add-project" className={`action-button navbar-button nav-add-button ${isEditMode ? 'disabled-link' : ''}`} aria-disabled={isEditMode} onClick={isEditMode ? (e)=>e.preventDefault() : undefined}>Add Project</Link></div>
                <div className="navbar-section theme-toggle-section"><button onClick={toggleTheme} className="theme-toggle-button-nav" aria-label={`Switch theme`} disabled={isEditMode}>{theme === 'dark' ? '🌙' : '☀️'}</button></div>
            </nav>
            <main className="main-content">
                <h1 className="projects-header">PROJECT DASHBOARD</h1>
                {error && <p className="error-message main-error" onClick={()=>setError(null)} style={{cursor:'pointer'}} title="Click to dismiss">{error}</p>}
                {isLoading && !filteredAndOrderedProjects.length && <p className="loading-indicator">Loading dashboard...</p>}
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={orderedProjectIds} strategy={verticalListSortingStrategy}>
                         <div className="project-cards-container">
                             {!isLoading && projects.length === 0 && !error && <p>No projects configured. <Link href="/add-project" className={isEditMode ? 'disabled-link' : ''}>Add your first project!</Link></p>}
                             {!isLoading && projects.length > 0 && filteredAndOrderedProjects.length === 0 && <p>No projects match the current filters.</p>}
                             {filteredAndOrderedProjects.map((project) => (
                                 <SortableProjectCard key={project.project_name} project={project} isRunning={activeProjects[project.project_name] || false} isStarting={startingProjects.has(project.project_name)} isEditMode={isEditMode} onStart={handleStartProject} onStop={handleStopProject} onOpen={handleOpenProjectWindow} />
                             ))}
                         </div>
                    </SortableContext>
                 </DndContext>
            </main>
        </div>
    );
}
