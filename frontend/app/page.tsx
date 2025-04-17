// FRONTEND (./app/page.tsx or similar) - FINAL COMPLETE FILE (Build Fix 7)

"use client";

import { useEffect, useState, useRef, useCallback, ChangeEvent, FormEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import type { MultiValue } from 'react-select';
import { useTheme } from './ThemeContext';

// Dynamically import React Select
const Select = dynamic(() => import('react-select'), {
  ssr: false,
  loading: () => <div className='filter-select filter-multiselect' style={{ minHeight: '38px', display: 'flex', alignItems: 'center', color: '#aaa', paddingLeft: '10px' }}>Loading...</div>
});

// --- Interfaces ---
interface CardData { card_id: string; card_name: string; card_description: string; label_id: string; label_name: string; }
interface ProjectData { project_name: string; description: string; icon_filename: string; icon_path: string; startup_script: string; port: string; scheme: 'http' | 'https'; host: string; cards: CardData[]; }
interface Label { id: string; name: string; label_type: string; }
interface InitialStatusResult { name: string; running: boolean; }
interface SelectOption { value: string; label: string; }

// --- Constants ---
const POLLING_INTERVAL = 3000;
const FIXED_HOST_FOR_CUSTOM_PORT = process.env.NEXT_PUBLIC_FIXED_HOST || '100.94.150.11';


// --- Main Home Component ---
export default function Home() {
    // --- State ---
    const [projects, setProjects] = useState<ProjectData[]>([]);
    const [filteredProjects, setFilteredProjects] = useState<ProjectData[]>([]);
    const [selectedLanguageOptions, setSelectedLanguageOptions] = useState<MultiValue<SelectOption>>([]);
    const [selectedUtilityOptions, setSelectedUtilityOptions] = useState<MultiValue<SelectOption>>([]);
    const [availableLabels, setAvailableLabels] = useState<Label[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [activeProjects, setActiveProjects] = useState<Record<string, boolean>>({});
    const [startingProjects, setStartingProjects] = useState<Set<string>>(new Set());
    const [projectJustStarted, setProjectJustStarted] = useState<ProjectData | null>(null);
    const [customPort, setCustomPort] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [searchTerm, setSearchTerm] = useState<string>('');
    const [addSuccess, setAddSuccess] = useState<string | null>(null); // Keep for potential redirects/messages

    // --- Context & Refs ---
    const { theme, toggleTheme } = useTheme();
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const projectsRef = useRef<ProjectData[]>([]);
    const startingProjectsRef = useRef<Set<string>>(new Set());

    // --- Refs Sync ---
    useEffect(() => { projectsRef.current = projects; }, [projects]);
    useEffect(() => { startingProjectsRef.current = startingProjects; }, [startingProjects]);

    // --- Helpers ---
    const getLanguageOptions = useCallback((labels: Label[]): SelectOption[] => labels.filter(l => l.label_type === 'language').map(l => ({ value: l.id, label: l.name })), []);
    const getUtilityOptions = useCallback((labels: Label[]): SelectOption[] => labels.filter(l => l.label_type === 'utility').map(l => ({ value: l.id, label: l.name })), []);

    // --- Data Fetching ---
    const fetchLabels = useCallback(async () => {
        try { const r=await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/labels`); if(!r.ok) throw new Error(`Fetch fail ${r.status}`); const d:Label[]=await r.json(); if(!Array.isArray(d)) throw new Error("Invalid format."); setAvailableLabels(d); if(d.length>0&&typeof d[0].label_type==='undefined'){console.warn("Labels missing type"); setError(p=>p?.includes("type")?p:"Labels missing type.");} else{setError(p=>p?.includes("type")?null:p);} }
        catch(e:any){console.error("Fetch labels err:", e); setError(`Labels fail: ${e.message}`); setAvailableLabels([]); setSelectedLanguageOptions([]); setSelectedUtilityOptions([]);}
    }, [setError]);

    const fetchProjectsAndStatus = useCallback(async (isInitial = false) => {
        if(isInitial){setIsLoading(true);setError(null);}
        try{ const r=await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/projects`); if(!r.ok) throw new Error(`Fetch fail ${r.status} ${await r.text()}`); const d:ProjectData[]=await r.json(); if(!Array.isArray(d)) throw new Error("Invalid format.");
            setProjects(d); projectsRef.current=d;
            let fetchedStatuses:Record<string,boolean>|null=null; if(isInitial||d.length!==projectsRef.current.length){fetchedStatuses={};if(d.length>0){ const p=d.map(async(p):Promise<InitialStatusResult>=>{if(!p?.project_name||!p.port)return{name:'unknown',running:false}; try{ const rFetch=await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/check-project`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({port:p.port})}); return{name:p.project_name,running:rFetch.ok?(await rFetch.json()).running:false};} catch{return{name:p.project_name,running:false};}}); const rs=await Promise.all(p); rs.forEach(s=>{if(s.name!=='unknown')fetchedStatuses![s.name]=s.running;});}}
            if(fetchedStatuses!==null){setActiveProjects(fetchedStatuses);}
        }catch(e:any){console.error("Fetch projects err:", e); setError(`Projects fail: ${e.message}`);}
        finally{if(isInitial)setIsLoading(false);}
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [setError]); // setError added as dependency

    // --- Initial Load ---
    useEffect(() => { const load = async () => { setIsLoading(true); setError(null); try { await fetchLabels(); await fetchProjectsAndStatus(true); console.log("🚀 Init load OK."); } catch (e) { console.error("Init load err:", e); } finally { setIsLoading(false); } }; load(); }, [fetchLabels, fetchProjectsAndStatus]); // Use stable fetch functions

    // --- Status Polling ---
     const checkAllProjectsStatus = useCallback(async () => {
        const currentProjects = projectsRef.current; if (!currentProjects || currentProjects.length === 0 || !navigator.onLine) return;
        const currentStartingProjects = startingProjectsRef.current;

        // Fetch all statuses
        const statusPromises = currentProjects.map(async (proj) => {
            // Added more robust check
            if (!proj?.project_name || !proj.port) {
                return { name: proj?.project_name || 'unknown', running: activeProjects[proj?.project_name] ?? false, projectData: undefined };
            }
            try {
                const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/check-project`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ port: proj.port }) });
                const prevRunning = activeProjects[proj.project_name] ?? false;
                return { name: proj.project_name, running: response.ok ? (await response.json()).running : prevRunning, projectData: proj };
            } catch (e){
                return { name: proj.project_name, running: activeProjects[proj.project_name] ?? false, projectData: proj };
            }
        });
        const results = await Promise.all(statusPromises);

        // Process results to determine next state and which project (if any) just started
        let changed = false;
        let determinedProjectToAutoOpen: ProjectData | null = null;
        const nextActiveState = { ...activeProjects }; // Start with copy

        results.forEach(result => {
            if (!result || result.name === 'unknown') return; // Skip invalid results
            const currentStatus = activeProjects[result.name] ?? false; // Compare against original state
            const newStatus = result.running;
            if (currentStatus !== newStatus) {
                // console.log(`Poll Status: ${result.name} ${currentStatus} -> ${newStatus}`);
                nextActiveState[result.name] = newStatus; // Update temporary copy
                changed = true;
                // Check projectData validity before assigning
                if (newStatus === true && currentStartingProjects.has(result.name) && result.projectData) {
                    determinedProjectToAutoOpen = result.projectData;
                }
            }
        });

        // Update main state if changes occurred
        if (changed) {
            setActiveProjects(nextActiveState);
        }

        // Handle auto-open and startingProjects update separately and safely
        if (determinedProjectToAutoOpen) {
            // This check acts as a type guard, determinedProjectToAutoOpen is ProjectData here
            const name = (determinedProjectToAutoOpen as ProjectData).project_name;
    setProjectJustStarted(determinedProjectToAutoOpen as ProjectData);
    setStartingProjects(prevStarting => {
        const newStarting = new Set(prevStarting);
        newStarting.add((determinedProjectToAutoOpen as ProjectData).project_name);
        return newStarting;
    });
            setProjectJustStarted(determinedProjectToAutoOpen); // Trigger effect for opening window
            setStartingProjects(prevStarting => { // Update starting set
                const newStarting = new Set(prevStarting);
                if (newStarting.has(name)) {
                    newStarting.delete(name);
                    startingProjectsRef.current = newStarting; // Sync ref immediately
                    console.log(`Polling Removed ${name} starting`);
                    return newStarting;
                }
                return prevStarting; // No change if name wasn't found (shouldn't happen)
            });
        }
     }, [activeProjects]); // Depends on activeProjects for comparisons


    // --- Auto-Open Window ---
    const handleOpenProject = useCallback((scheme: 'http' | 'https', host: string, port: string) => {
        try { if (!scheme || !host || !port) throw new Error(`Invalid args`); const portNum = parseInt(port, 10); let url: string; const fHost = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host; url = `${scheme}://${fHost}`; if (!isNaN(portNum) && !(scheme==='http'&&portNum===80) && !(scheme==='https'&&portNum===443)) url+=`:${port}`; console.log(`\ud83d\udd17 Opening: ${url}`); window.open(url, '_blank', 'noopener,noreferrer'); }
        catch (error: any) { console.error("Open error:", error); setError(`Open fail: ${error.message}`); }
    }, [setError]);
    useEffect(() => { if (projectJustStarted) { handleOpenProject(projectJustStarted.scheme, projectJustStarted.host, projectJustStarted.port); setProjectJustStarted(null); } }, [projectJustStarted, handleOpenProject]);

    // --- Polling Interval ---
    useEffect(() => { let id: NodeJS.Timeout | null = null; if (projects.length > 0 && !isLoading) { console.log(`Starting polling...`); id = setInterval(checkAllProjectsStatus, POLLING_INTERVAL); intervalRef.current = id; } return () => { if (id) clearInterval(id); if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; } console.log("Cleared poll."); }; }, [projects, isLoading, checkAllProjectsStatus]);

    // --- Filtering ---
    useEffect(() => { const currentLangs = new Set(selectedLanguageOptions.map(o => o.value)); const currentUtils = new Set(selectedUtilityOptions.map(o => o.value)); const search = searchTerm.toLowerCase().trim();
        const newFiltered = projects.filter(proj => { if (!proj?.project_name) return false; if (search && !proj.project_name.toLowerCase().includes(search)) return false; const labels = new Set(proj.cards.map(c => c.label_id)); if (currentLangs.size > 0 && !Array.from(currentLangs).some(id => labels.has(id))) return false; if (currentUtils.size > 0 && !Array.from(currentUtils).some(id => labels.has(id))) return false; return true; });
        setFilteredProjects(newFiltered);
    }, [searchTerm, selectedLanguageOptions, selectedUtilityOptions, projects]);

    // --- Event Handlers ---
    const handleMultiFilterChange = useCallback((selected: MultiValue<SelectOption>, type: 'language' | 'utility') => { if (type === 'language') setSelectedLanguageOptions(selected); else if (type === 'utility') setSelectedUtilityOptions(selected); }, []);
    const handleStartProject = useCallback(async (projectName: string) => { setError(null); if (startingProjects.has(projectName) || activeProjects[projectName]) return; console.log(`\u25B6\uFE0F Start: ${projectName}`); setStartingProjects(p => { const n = new Set(p); n.add(projectName); startingProjectsRef.current = n; return n; }); try { const r = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/start-project`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectName }), }); if (r.status !== 202 && !r.ok) throw new Error(`Start fail ${r.status}: ${await r.text()}`); } catch (e: any) { console.error(`Start err ${projectName}:`, e); setError(`Start fail: ${e.message}`); setStartingProjects(p => { const n = new Set(p); n.delete(projectName); startingProjectsRef.current = n; return n; }); } }, [activeProjects, startingProjects, setError]);
    const handleStopProject = useCallback(async (projectName: string) => { setError(null); console.log(`\u23F9\uFE0F Stop: ${projectName}`); try { const r = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/stop-project`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectName }), }); const d = await r.json(); if (!r.ok) throw new Error(d.error || `Stop fail: ${r.status}`); console.log(`Stop OK: ${projectName}`); setActiveProjects(p => ({ ...p, [projectName]: false })); if (startingProjects.has(projectName)) { setStartingProjects(prev => { const n = new Set(prev); n.delete(projectName); startingProjectsRef.current = n; return n; }); } } catch (e: any) { console.error(`Stop err ${projectName}:`, e); setError(e.message || `Stop err ${projectName}`); const proj = projectsRef.current.find(p => p.project_name === projectName); if (proj) { const quickCheck = async () => { try { const rc = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/check-project`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ port: proj.port }) }); if (rc.ok){ const data = await rc.json(); setActiveProjects(p => ({ ...p, [projectName]: data.running })); } } catch (e2) { console.error("Quick check fail:", e2); } }; quickCheck(); } } }, [activeProjects, startingProjects, setError]);
    const handleOpenCustomPort = useCallback(() => { setError(null); const port = customPort.trim(); if (!port || !/^\d+$/.test(port)) { setError(!port ? "Enter port." : "Invalid port."); return; } console.log(`Opening custom: ${port}`); const url = `http://${FIXED_HOST_FOR_CUSTOM_PORT}:${port}`; window.open(url, '_blank', 'noopener,noreferrer'); setCustomPort(''); }, [customPort, setError]);

    // --- Render ---
    return (
        <div className={`container ${theme}`}>
             <nav className="top-navbar">
                <div className="navbar-section filters-section">
                    <div className="filter-container search-container"> <label htmlFor="project-search" className="filter-label">Search:</label> <input type="search" id="project-search" className="navbar-control search-input" placeholder="Project name..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} aria-label="Search projects"/> </div>
                    <div className="filter-container react-select-container"> <label htmlFor="language-filter-rs" className="filter-label">Language:</label> { availableLabels.length > 0 || !isLoading ? ( <Select instanceId="lang-select" inputId='language-filter-rs' isMulti name="languages" options={getLanguageOptions(availableLabels)} className="react-select-instance" classNamePrefix="react-select" value={selectedLanguageOptions} onChange={(s, _meta) => handleMultiFilterChange(s as MultiValue<SelectOption>, 'language')} placeholder="Filter languages..." isClearable={true} closeMenuOnSelect={false} /> ) : <div className='filter-select filter-multiselect' style={{ minHeight: '38px', display: 'flex', alignItems: 'center', color: '#aaa', paddingLeft: '10px' }}>Loading...</div> } </div>
                    <div className="filter-container react-select-container"> <label htmlFor="utility-filter-rs" className="filter-label">Utility:</label> { availableLabels.length > 0 || !isLoading ? ( <Select instanceId="util-select" inputId='utility-filter-rs' isMulti name="utilities" options={getUtilityOptions(availableLabels)} className="react-select-instance" classNamePrefix="react-select" value={selectedUtilityOptions} onChange={(s, _meta) => handleMultiFilterChange(s as MultiValue<SelectOption>, 'utility')} placeholder="Filter utilities..." isClearable={true} closeMenuOnSelect={false} /> ): <div className='filter-select filter-multiselect' style={{ minHeight: '38px', display: 'flex', alignItems: 'center', color: '#aaa', paddingLeft: '10px' }}>Loading...</div> } </div>
                </div>
                 <div className="navbar-section custom-port-section"> <div className="filter-container custom-port-opener"> <label htmlFor="custom-port-input" className="filter-label">Open Port:</label> <input type="text" id="custom-port-input" className="custom-port-input navbar-control" value={customPort} onChange={(e) => setCustomPort(e.target.value)} placeholder="e.g., 8080" aria-label="Enter port number" /> <button onClick={handleOpenCustomPort} className="action-button open-custom-button" title={`Open http://${FIXED_HOST_FOR_CUSTOM_PORT}:${customPort || 'port'}`}>🔗 Open</button> </div> </div>
                 <div className="navbar-section add-buttons-section"> <Link href="/add-label" className="action-button nav-add-button">Add Label</Link> <Link href="/add-project" className="action-button nav-add-button">Add Project</Link> </div>
                 <button onClick={toggleTheme} className="theme-toggle-button-nav" aria-label={`Switch theme`}> {theme === 'dark' ? '🌙' : '☀️'} </button>
            </nav>

            <main className="main-content">
                 <h1 className="projects-header">PROJECT DASHBOARD</h1>
                 {error && <p className="error-message main-error">Error: {error}</p>}
                 {addSuccess && <p className="success-message add-success">{addSuccess}</p>}
                 {isLoading && <p className="loading-indicator">Loading initial data...</p>}

                 <div className="project-cards-container">
                     {!isLoading && projects.length === 0 && !error && <p>No projects found. <Link href="/add-project">Add one?</Link></p>}
                     {!isLoading && projects.length > 0 && filteredProjects.length === 0 && <p>No projects match the current filters.</p>}
                     {filteredProjects.map((project) => {
                         if (!project?.project_name) return null;
                         const isRunning = activeProjects[project.project_name] ?? false;
                         const isStarting = startingProjects.has(project.project_name);
                         const scheme = project.scheme || 'http';
                         const host = project.host || 'localhost';
                         return (
                            <div key={project.project_name} className={`project-card ${isRunning ? 'active' : ''} ${isStarting ? 'starting' : ''}`}>
                                <h2>{project.project_name}</h2>
                                {project.icon_path && project.icon_path !== '/label_icons/default.png' && ( <Image className="project-icon" src={project.icon_path} alt={`${project.project_name} Icon`} width={50} height={50} priority={false} unoptimized={true} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} /> )}
                                <p className="project-description">{project.description || 'No description provided.'}</p>
                                <div className="label-icons"> {project.cards.map((card) => ( <div key={card.label_id} className="tooltip"> <Image className="label-icon" src={`/label_icons/${card.label_name}.png`} alt={`${card.label_name} Icon`} width={30} height={30} onError={(e) => { (e.target as HTMLImageElement).src = '/label_icons/default.png'; }} /> <span className="tooltiptext">{card.label_name}</span> </div> ))} </div>
                                <div className="project-actions"> {isStarting ? ( <button className="action-button start-button" disabled> <span className="spinner" aria-hidden="true"></span> Starting... </button> ) : isRunning ? ( <button className="action-button open-button" onClick={() => handleOpenProject(scheme, host, project.port)} title={`Open ${scheme}://${host}:${project.port}`}> 🚀 Open </button> ) : ( <button className="action-button start-button" onClick={() => handleStartProject(project.project_name)} disabled={isStarting}> ▶️ Start </button> )} <button className="action-button stop-button" onClick={() => handleStopProject(project.project_name)} disabled={!isRunning || isStarting} title={!isRunning ? "Not running" : (isStarting ? "Starting" : "Stop")}> ⏹️ Stop </button> </div>
                                <div className={`status-indicator ${isRunning ? 'running' : (isStarting ? 'pending' : 'stopped')}`}> {isStarting ? 'Pending' : (isRunning ? 'Running' : 'Stopped')} on {host}:{project.port} </div>
                            </div>
                         );
                    })}
                 </div>
            </main>
        </div>
    );
}