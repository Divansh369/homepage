// FRONTEND (./app/page.tsx or similar) - FINAL COMPLETE FILE

"use client";

import { useEffect, useState, useRef, useCallback, ChangeEvent, FormEvent } from 'react'; // Added useCallback back if needed
import Image from 'next/image';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import type { MultiValue } from 'react-select';
import { useTheme } from './ThemeContext';

// --- Dynamically import React Select ---
const Select = dynamic(() => import('react-select'), {
  ssr: false,
  loading: () => <div className='filter-select filter-multiselect' style={{ minHeight: '38px', display: 'flex', alignItems: 'center', color: '#aaa' }}>Loading...</div>
});

// --- Interfaces ---
interface CardData { card_id: string; card_name: string; card_description: string; label_id: string; label_name: string; }
interface ProjectData { project_name: string; description: string; icon_filename: string; icon_path: string; startup_script: string; port: string; scheme: 'http' | 'https'; host: string; cards: CardData[]; }
interface Label { id: string; name: string; label_type: string; }
interface InitialStatusResult { name: string; running: boolean; }
interface SelectOption { value: string; label: string; }

// --- Constants ---
const POLLING_INTERVAL = 3000;
const FIXED_HOST_FOR_CUSTOM_PORT = process.env.NEXT_PUBLIC_FIXED_HOST || '100.114.43.102';

export default function Home() {
    // --- State Variables ---
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
    const [searchTerm, setSearchTerm] = useState<string>(''); // <<< ADDED: State for search input

    // --- Context and Refs ---
    const { theme, toggleTheme } = useTheme();
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const projectsRef = useRef<ProjectData[]>([]);
    const startingProjectsRef = useRef<Set<string>>(new Set());

    // --- Refs Synchronization ---
    useEffect(() => { projectsRef.current = projects; }, [projects]);
    useEffect(() => { startingProjectsRef.current = startingProjects; }, [startingProjects]);

    // --- Helper functions to format labels for React Select ---
    const getLanguageOptions = (labels: Label[]): SelectOption[] => {
        return labels.filter(l => l.label_type === 'language').map(l => ({ value: l.id, label: l.name }));
    };
    const getUtilityOptions = (labels: Label[]): SelectOption[] => {
        return labels.filter(l => l.label_type === 'utility').map(l => ({ value: l.id, label: l.name }));
    };

    // --- Data Fetching & Refresh Logic ---
    // Using useCallback for potentially stable functions passed as dependencies
    const fetchLabels = useCallback(async () => {
        try {
            // console.log("Fetching labels...");
            const labelsRes = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/labels`);
            if (!labelsRes.ok) throw new Error(`Labels fetch failed: ${labelsRes.status}`);
            const labelsData: Label[] = await labelsRes.json();
            if (!Array.isArray(labelsData)) throw new Error("Invalid label data format.");

            setAvailableLabels(labelsData);
            // console.log("Labels updated:", labelsData);

            // Set default selections AFTER labels are available
            // const allLangOptions = getLanguageOptions(labelsData);
            // const allUtilOptions = getUtilityOptions(labelsData);
            // setSelectedLanguageOptions(allLangOptions);
            // setSelectedUtilityOptions(allUtilOptions);
            // console.log("Default filters set.");

            if (labelsData.length > 0 && typeof labelsData[0].label_type === 'undefined') {
                console.warn("Warning: Labels missing 'label_type'.");
                setError(prev => prev?.includes("label type") ? prev : "Labels missing type info.");
            } else {
                 setError(prev => prev?.includes("label type") ? null : prev);
            }
        } catch (err: any) {
            console.error("Error fetching labels:", err);
            setError(`Fetch labels failed: ${err.message || 'Unknown'}`);
            setAvailableLabels([]);
            setSelectedLanguageOptions([]);
            setSelectedUtilityOptions([]);
        }
    }, [setError]); // Dependency on setError setter function

    const fetchProjectsAndStatus = useCallback(async (isInitial = false) => {
        if(isInitial) setIsLoading(true);
        if(isInitial) setError(null);
        // console.log("Fetching projects and status...");
        try {
            const projectsRes = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/projects`);
            if (!projectsRes.ok) throw new Error(`Projects fetch failed: ${projectsRes.status} ${await projectsRes.text()}`);
            const projectsData: ProjectData[] = await projectsRes.json();
            if (!Array.isArray(projectsData)) throw new Error("Invalid project data format.");

            let fetchedStatuses: Record<string, boolean> | null = null;
            if (isInitial || projectsData.length !== projectsRef.current.length) {
                 // console.log("Performing status check...");
                 fetchedStatuses = {};
                 if (projectsData.length > 0) {
                     const statusPromises = projectsData.map(async (p): Promise<InitialStatusResult> => {
                         if (!p?.project_name || !p.port) return { name: 'unknown', running: false };
                         try { const r = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/check-project`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ port: p.port }) }); return { name: p.project_name, running: r.ok ? (await r.json()).running : false }; }
                         catch { return { name: p.project_name, running: false }; }
                     });
                     const statusResults = await Promise.all(statusPromises);
                     statusResults.forEach(s => { if (s.name !== 'unknown') (fetchedStatuses as Record<string, boolean>)[s.name] = s.running; });
                 }
             }

            // console.log("Updating projects state.");
            setProjects(projectsData);
            if (fetchedStatuses !== null) {
                 // console.log("Updating active projects state.");
                 setActiveProjects(fetchedStatuses);
            }
            projectsRef.current = projectsData;

        } catch (err: any) {
            console.error("Error fetching projects/status:", err);
            setError(`Refresh projects failed: ${err.message || 'Unknown'}`);
        } finally {
             if(isInitial) setIsLoading(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Empty array: Assuming it doesn't need external state for its core logic

    // --- Initial Data Load ---
    useEffect(() => {
        const initialLoad = async () => { setIsLoading(true); setError(null); console.log("🚀 Initial load...");
            try { await fetchLabels(); await fetchProjectsAndStatus(true); console.log("🚀 Initial load complete."); }
            catch (err: any) { console.error("Initial load error:", err); }
            finally { setIsLoading(false); }
        };
        initialLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Fetch functions defined with useCallback

    // --- Project Status Polling Logic ---
     const checkAllProjectsStatus = useCallback(async (currentProjects: ProjectData[]) => {
        if (!currentProjects || currentProjects.length === 0 || !navigator.onLine) { return; }
        const currentStartingProjects = startingProjectsRef.current;
        const statusPromises = currentProjects.map(async (project) => {
             if (!project?.project_name || !project.port) return { name: 'unknown', running: activeProjects[project?.project_name] ?? false, projectData: project };
            try {
                const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/check-project`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ port: project.port }) });
                const prevRunning = activeProjects[project.project_name] ?? false;
                return { name: project.project_name, running: response.ok ? (await response.json()).running : prevRunning, projectData: project };
            } catch (e){ return { name: project.project_name, running: activeProjects[project.project_name] ?? false, projectData: project }; }
        });
        const results = await Promise.all(statusPromises);
        setActiveProjects(prevActive => {
            const newActiveState = { ...prevActive }; let activeChanged = false; let projectToAutoOpen: ProjectData | null = null;
            results.forEach(result => {
                if (!result || result.name === 'unknown') return;
                const currentStatus = prevActive[result.name] ?? false; const newStatus = result.running;
                if (currentStatus !== newStatus) { console.log(`Polling Status: ${result.name} ${currentStatus} -> ${newStatus}`); newActiveState[result.name] = newStatus; activeChanged = true;
                    if (newStatus === true && currentStartingProjects.has(result.name)) { console.log(`Polling: ✅ ${result.name} confirmed running.`); projectToAutoOpen = result.projectData; }
                }
            });
            if (projectToAutoOpen) {
                const name = projectToAutoOpen.project_name;
                setProjectJustStarted(projectToAutoOpen);
                setStartingProjects(prevStarting => {
                    const newStarting = new Set(prevStarting);
                    if (newStarting.has(name)) { newStarting.delete(name); startingProjectsRef.current = newStarting; console.log(`Polling Removed ${name} starting`); return newStarting; }
                    return prevStarting;
                });
            } return activeChanged ? newActiveState : prevActive;
        });
     }, [activeProjects]); // Depends on activeProjects for comparison

     // --- Effect for Auto-Opening Window ---
     // handleOpenProject is defined below and stable
     const handleOpenProject = (scheme: 'http' | 'https', host: string, port: string) => {
        try { if (!scheme || !host || !port) { throw new Error(`Invalid args`); } const portNum = parseInt(port, 10); let url: string; const fHost = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host; url = `${scheme}://${fHost}`; if (!isNaN(portNum) && !(scheme==='http'&&portNum===80) && !(scheme==='https'&&portNum===443)) url+=`:${port}`; console.log(`\ud83d\udd17 Opening: ${url}`); window.open(url, '_blank', 'noopener,noreferrer'); }
        catch (error: any) { console.error("Open error:", error); setError(`Open fail: ${error.message}`); }
    };
     useEffect(() => {
        if (projectJustStarted) {
            console.log(`\ud83d\udd17 Effect opening window for ${projectJustStarted.project_name}`);
            handleOpenProject(projectJustStarted.scheme, projectJustStarted.host, projectJustStarted.port);
            setProjectJustStarted(null);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectJustStarted]); // Only depends on the trigger state

    // --- Setup Polling Interval ---
    useEffect(() => {
        let intervalId: NodeJS.Timeout | null = null;
        if (projects.length > 0 && !isLoading) {
            console.log(`Starting polling interval...`);
            intervalId = setInterval(() => { checkAllProjectsStatus(projectsRef.current); }, POLLING_INTERVAL);
            intervalRef.current = intervalId;
        } return () => { if (intervalId) { console.log("Clearing polling interval."); clearInterval(intervalId); } if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projects, isLoading]); // Removed checkAllProjectsStatus dependency

    // --- Filtering Logic ---
    useEffect(() => {
        let tempFiltered = projects;
        
        const lowerSearchTerm = searchTerm.toLowerCase().trim();
        if (lowerSearchTerm) {
            tempFiltered = tempFiltered.filter(project =>
                project.project_name.toLowerCase().includes(lowerSearchTerm)
            );
        }

        // Language check: True if no languages are selected OR project has at least one selected language
        const currentSelectedLanguages = new Set(selectedLanguageOptions.map(opt => opt.value));
        if (currentSelectedLanguages.size > 0) {
            tempFiltered = tempFiltered.filter(project => {
                const projectLabelIds = new Set(project.cards.map(card => card.label_id));
                return Array.from(currentSelectedLanguages).some(langId => projectLabelIds.has(langId));
            });
        }

        // --- 3. Filter FURTHER by Selected Utilities (on the already search/language-filtered list) ---
        const currentSelectedUtilities = new Set(selectedUtilityOptions.map(opt => opt.value));
        if (currentSelectedUtilities.size > 0) {
            tempFiltered = tempFiltered.filter(project => {
                const projectLabelIds = new Set(project.cards.map(card => card.label_id));
                return Array.from(currentSelectedUtilities).some(utilId => projectLabelIds.has(utilId));
            });
        }

        // Update the state with the final filtered list
        setFilteredProjects(tempFiltered);

    }, [searchTerm, selectedLanguageOptions, selectedUtilityOptions, projects]); // <<< ADDED searchTerm dependency

    // --- Event Handlers ---

    // Multi-select handler using React Select's structure
    const handleMultiFilterChange = (selected: MultiValue<SelectOption>, type: 'language' | 'utility') => {
        if (type === 'language') {
            setSelectedLanguageOptions(selected);
        } else if (type === 'utility') {
            setSelectedUtilityOptions(selected);
        }
    };

    // Use simple functions for handlers (no useCallback needed unless profiling shows issues)
    const handleStartProject = async (projectName: string) => {
        setError(null); if (startingProjects.has(projectName) || activeProjects[projectName]) { console.warn(`Start ignored: ${projectName} busy.`); return; }
        console.log(`\u25B6\uFE0F Start init: ${projectName}`); setStartingProjects(prev => { const ns = new Set(prev); ns.add(projectName); startingProjectsRef.current = ns; return ns; });
        try { const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/start-project`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectName }), });
            if (res.status === 202) { console.log(`Backend ACK start: ${projectName}`); } else if (!res.ok) { throw new Error(`Start fail ${res.status}: ${await res.text()}`); } else { console.log(`Start req unexpected status ${res.status}`); }
        } catch (err: any) { console.error(`Start error ${projectName}:`, err); setError(`Start fail ${projectName}: ${err.message}`); setStartingProjects(prev => { const ns = new Set(prev); ns.delete(projectName); startingProjectsRef.current = ns; return ns; }); }
    };

    const handleStopProject = async (projectName: string) => {
        setError(null); console.log(`\u23F9\uFE0F Stop init: ${projectName}`);
        try { const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/stop-project`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectName }), });
             const respBody = await res.json(); if (!res.ok) { throw new Error(respBody.error || `Stop fail: ${res.status}`); }
            console.log(`Stop OK: ${projectName} - ${respBody.message}`); setActiveProjects((prev) => ({ ...prev, [projectName]: false }));
             if (startingProjects.has(projectName)) { setStartingProjects(prev => { const ns = new Set(prev); ns.delete(projectName); startingProjectsRef.current = ns; return ns; }); }
        } catch (err: any) { console.error(`Stop error ${projectName}:`, err); setError(err.message || `Stop error ${projectName}`);
            const currentProject = projectsRef.current.find(p => p.project_name === projectName);
            if (currentProject) {
                 const quickCheck = async () => { try { const r = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/check-project`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ port: currentProject.port }) }); if(r.ok) { const data = await r.json(); setActiveProjects(prev => ({...prev, [projectName]: data.running})); } } catch (e) { console.error("Quick check fail:", e); } }; quickCheck();
            }
        }
    };

    // handleOpenProject defined earlier

    const handleOpenCustomPort = () => { setError(null); const port = customPort.trim(); if (!port || !/^\d+$/.test(port)) { setError(!port ? "Enter port." : "Invalid port."); return; } console.log(`Opening custom: ${port} @ ${FIXED_HOST_FOR_CUSTOM_PORT}`); const url = `http://${FIXED_HOST_FOR_CUSTOM_PORT}:${port}`; window.open(url, '_blank', 'noopener,noreferrer'); setCustomPort(''); };


    // --- Render ---
    return (
        <div className={`container ${theme}`}>
             <nav className="top-navbar">
                <div className="navbar-section filters-section">
                <div className="filter-container search-container">
                        <label htmlFor="project-search" className="filter-label">Search:</label>
                        <input
                            type="search" // Use type="search" for semantics and potential browser features
                            id="project-search"
                            className="navbar-control search-input" // Reuse navbar-control style + specific class
                            placeholder="Project name..."
                            value={searchTerm}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                            aria-label="Search projects by name"
                         />
                    </div>
                    <div className="filter-container react-select-container">
                      <label htmlFor="language-filter-rs" className="filter-label">Language:</label>
                      { availableLabels.length > 0 || !isLoading ? (
                          <Select
                            instanceId="language-filter-select" inputId='language-filter-rs'
                            isMulti name="languages" options={getLanguageOptions(availableLabels)}
                            className="react-select-instance" classNamePrefix="react-select"
                            value={selectedLanguageOptions} onChange={(selected) => handleMultiFilterChange(selected, 'language')}
                            placeholder="e.g. Python" isClearable={true} closeMenuOnSelect={false}
                          />
                      ) : <div className='filter-select filter-multiselect' style={{ minHeight: '38px', display: 'flex', alignItems: 'center', color: '#aaa' }}>Loading...</div> }
                    </div>
                    <div className="filter-container react-select-container">
                      <label htmlFor="utility-filter-rs" className="filter-label">Utility:</label>
                       { availableLabels.length > 0 || !isLoading ? (
                          <Select
                            instanceId="utility-filter-select" inputId='utility-filter-rs'
                            isMulti name="utilities" options={getUtilityOptions(availableLabels)}
                            className="react-select-instance" classNamePrefix="react-select"
                            value={selectedUtilityOptions} onChange={(selected) => handleMultiFilterChange(selected, 'utility')}
                            placeholder="e.g. Dashboard" isClearable={true} closeMenuOnSelect={false}
                          />
                       ): <div className='filter-select filter-multiselect' style={{ minHeight: '38px', display: 'flex', alignItems: 'center', color: '#aaa' }}>Loading...</div> }
                    </div>
                </div>
                 <div className="navbar-section custom-port-section">
                     <div className="filter-container custom-port-opener"> <label htmlFor="custom-port-input" className="filter-label">Open Port:</label> <input type="text" id="custom-port-input" className="custom-port-input" value={customPort} onChange={(e) => setCustomPort(e.target.value)} placeholder="e.g. 8080" aria-label="Enter port number" /> <button onClick={handleOpenCustomPort} className="action-button open-custom-button" title={`Open http://${FIXED_HOST_FOR_CUSTOM_PORT}:${customPort || 'port'}`}>🔗 Open</button> </div>
                </div>
                 <div className="navbar-section add-buttons-section">
                      <Link href="/add-label" className="action-button nav-add-button">Add Label</Link>
                      <Link href="/add-project" className="action-button nav-add-button">Add Project</Link>
                 </div>
                 <button onClick={toggleTheme} className="theme-toggle-button-nav" aria-label={`Switch theme`}> {theme === 'dark' ? '🌙' : '☀️'} </button>
            </nav>

            <main className="main-content">
                 <h1 className="projects-header">PROJECT DASHBOARD</h1>
                 {error && <p className="error-message main-error">Error: {error}</p>}
                 {isLoading && <p className="loading-indicator">Loading initial data...</p>}

                 <div className="project-cards-container">
                     {!isLoading && projects.length === 0 && !error && <p>No projects found. <Link href="/add-project">Add one?</Link></p>}
                     {!isLoading && projects.length > 0 && filteredProjects.length === 0 && <p>No projects match the current filters.</p>}
                    {/* --- CARD RENDERING LOGIC RESTORED --- */}
                    {filteredProjects.map((project) => {
                        if (!project?.project_name) return null; // Guard clause
                        const isRunning = activeProjects[project.project_name] ?? false;
                        const isStarting = startingProjects.has(project.project_name);
                        const scheme = project.scheme || 'http';
                        const host = project.host || 'localhost';
                        return (
                            <div key={project.project_name} className={`project-card ${isRunning ? 'active' : ''} ${isStarting ? 'starting' : ''}`}>
                                <h2>{project.project_name}</h2>
                                {project.icon_path && project.icon_path !== '/label_icons/default.png' && (
                                    <Image
                                        className="project-icon"
                                        src={project.icon_path}
                                        alt={`${project.project_name} Icon`}
                                        width={50} height={50} priority={false}
                                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                     />
                                 )}
                                <p className="project-description">{project.description || 'No description provided.'}</p>
                                <div className="label-icons">
                                    {project.cards.map((card) => (
                                        <div key={card.label_id /* now the name */} className="tooltip">
                                             <Image
                                                className="label-icon"
                                                src={`/label_icons/${card.label_name}.png`}
                                                alt={`${card.label_name} Icon`}
                                                width={30} height={30}
                                                onError={(e) => { (e.target as HTMLImageElement).src = '/label_icons/default.png'; }}
                                             />
                                             <span className="tooltiptext">{card.label_name}</span>
                                         </div>
                                     ))}
                                 </div>
                                <div className="project-actions">
                                     {isStarting ? ( <button className="action-button start-button" disabled> <span className="spinner" aria-hidden="true"></span> Starting... </button> )
                                     : isRunning ? ( <button className="action-button open-button" onClick={() => handleOpenProject(scheme, host, project.port)} title={`Open ${scheme}://${host}:${project.port}`}> 🚀 Open </button> )
                                     : ( <button className="action-button start-button" onClick={() => handleStartProject(project.project_name)} disabled={isStarting}> ▶️ Start </button> )}
                                     <button className="action-button stop-button" onClick={() => handleStopProject(project.project_name)} disabled={!isRunning || isStarting} title={!isRunning ? "Not running" : (isStarting ? "Starting" : "Stop")}> ⏹️ Stop </button>
                                 </div>
                                <div className={`status-indicator ${isRunning ? 'running' : (isStarting ? 'pending' : 'stopped')}`}>
                                     {isStarting ? 'Pending' : (isRunning ? 'Running' : 'Stopped')} on {host}:{project.port}
                                 </div>
                            </div>
                         );
                    })}
                     {/* --- END CARD RENDERING LOGIC --- */}
                 </div>
            </main>
            {/* --- Modals Removed --- */}
        </div>
    );
}