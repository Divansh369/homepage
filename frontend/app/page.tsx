// FRONTEND (./app/page.tsx or similar)
"use client";

import { useEffect, useState, useRef, useCallback } from 'react';
import Image from 'next/image';
import { useTheme } from './ThemeContext'; // Assuming ThemeContext exists

interface CardData {
    card_id: string;
    card_name: string;
    card_description: string;
    label_id: string;
    label_name: string;
}

interface ProjectData {
    project_name: string;
    icon_filename: string; // Original filename from CSV
    icon_path: string;      // Frontend-usable path (e.g., /projects/...)
    startup_script: string;
    port: string; // Keep as string for consistency, can parse if needed
    cards: CardData[];
    description: string; // Assuming description comes from project level
}

interface Label {
    id: string;
    name: string;
}

const POLLING_INTERVAL = 3000; // Check project status every 3 seconds

export default function Home() {
    const [projects, setProjects] = useState<ProjectData[]>([]);
    const [filteredProjects, setFilteredProjects] = useState<ProjectData[]>([]);
    const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
    const [availableLabels, setAvailableLabels] = useState<Label[]>([]);
    const [error, setError] = useState<string | null>(null);
    // State to track the *confirmed* running status from the backend
    const [activeProjects, setActiveProjects] = useState<Record<string, boolean>>({});
    // State to track projects that we *initiated* starting for, waiting for confirmation
    const [startingProjects, setStartingProjects] = useState<Set<string>>(new Set());
    const { theme, toggleTheme } = useTheme();
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const projectsRef = useRef<ProjectData[]>([]); // Ref to hold current projects for interval closure
    const startingProjectsRef = useRef<Set<string>>(new Set()); // Ref for starting projects

     // Update refs whenever state changes
     useEffect(() => {
        projectsRef.current = projects;
    }, [projects]);

    useEffect(() => {
        startingProjectsRef.current = startingProjects;
    }, [startingProjects]);

    // --- Data Fetching ---
    useEffect(() => {
        const fetchData = async () => {
            setError(null); // Clear previous errors
            console.log("Fetching initial data...");
            try {
                console.log("Fetching projects...");
                const projectsRes = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/projects`);
                if (!projectsRes.ok) {
                    throw new Error(`Failed to fetch projects: ${projectsRes.status} ${await projectsRes.text()}`);
                }
                const projectsData: ProjectData[] = await projectsRes.json();
                console.log("Projects received:", projectsData);
                setProjects(projectsData);
                setFilteredProjects(projectsData); // Initialize filter
                projectsRef.current = projectsData; // Update ref immediately

                console.log("Fetching labels...");
                const labelsRes = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/labels`);
                if (!labelsRes.ok) {
                    throw new Error(`Failed to fetch labels: ${labelsRes.status} ${await labelsRes.text()}`);
                }
                const labelsData: Label[] = await labelsRes.json();
                setAvailableLabels(labelsData);

                // Initial check of project statuses after fetching projects
                if (projectsData.length > 0) {
                    console.log("Performing initial project status check...");
                    checkAllProjectsStatus(projectsData, true); // Pass projects data directly
                }

            } catch (err: any) {
                console.error("Error fetching initial data:", err);
                setError(err.message || 'An error occurred during initial data load');
            }
        };
        fetchData();
    }, []); // Runs only on mount

    // --- Project Status Polling ---
    const checkAllProjectsStatus = useCallback(async (currentProjects: ProjectData[], isInitialCheck = false) => {
        if (!currentProjects || currentProjects.length === 0) {
             // console.log("Polling skipped: No projects data available.");
             return; // Don't poll if projects aren't loaded yet
        }
        console.log("Polling project statuses...");
        const currentStartingProjects = startingProjectsRef.current; // Get current starting set from ref

        const statusPromises = currentProjects.map(async (project) => {
            try {
                const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/check-project`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ port: project.port }),
                });
                if (!response.ok) {
                    console.error(`Error checking ${project.project_name} (Port: ${project.port}): ${response.status}`);
                    return { name: project.project_name, running: activeProjects[project.project_name] ?? false }; // Keep previous state on error
                }
                const data = await response.json();
                return { name: project.project_name, running: data.running, port: project.port };
            } catch (error) {
                console.error(`Network error checking project ${project.project_name}:`, error);
                return { name: project.project_name, running: activeProjects[project.project_name] ?? false }; // Keep previous state on network error
            }
        });

        const results = await Promise.all(statusPromises);

        // Process results and update state
        setActiveProjects(prev => {
             const newState = { ...prev };
             let changed = false;
             let justStartedProject: { name: string; port: string } | null = null;

             results.forEach(result => {
                 if (newState[result.name] !== result.running) {
                     console.log(`Status change for ${result.name}: ${newState[result.name]} -> ${result.running}`);
                     newState[result.name] = result.running;
                     changed = true;

                     // --- Handle project finishing startup ---
                     if (result.running && currentStartingProjects.has(result.name)) {
                         console.log(`✅ Project ${result.name} confirmed running.`);
                         // Mark for opening window *after* state update
                         justStartedProject = { name: result.name, port: result.port! };
                     }
                 }
             });

             if (justStartedProject) {
                  // Remove from starting set *after* confirming it's running
                  setStartingProjects(prevStarting => {
                     const newStarting = new Set(prevStarting);
                     newStarting.delete(justStartedProject!.name);
                     startingProjectsRef.current = newStarting; // Update ref immediately
                     return newStarting;
                  });
                   // Open the window now that it's confirmed running
                  console.log(`\ud83c\udf10 Opening window for ${justStartedProject.name} at port ${justStartedProject.port}`);
                  window.open(`http://100.114.43.102:${justStartedProject.port}`, '_blank');
             }

             return changed ? newState : prev; // Only update state if something actually changed
        });

    }, [activeProjects]); // Dependency on activeProjects to get previous state inside useCallback


    // Setup polling interval
    useEffect(() => {
        // Don't start polling until projects are loaded
        if (projects.length > 0) {
            console.log(`Starting status polling interval (${POLLING_INTERVAL}ms)...`);
            // Clear existing interval if projects list changes (though it shouldn't often)
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
            // Use ref to access the latest projects list inside interval
            intervalRef.current = setInterval(() => {
                checkAllProjectsStatus(projectsRef.current);
            }, POLLING_INTERVAL);
        }

        // Cleanup interval on component unmount
        return () => {
            if (intervalRef.current) {
                console.log("Clearing status polling interval.");
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [projects, checkAllProjectsStatus]); // Re-run if projects list or check function changes


    // --- Filtering Logic ---
    useEffect(() => {
        if (selectedLabel) {
            const filtered = projects.filter((project) =>
                project.cards.some((card) => card.label_id === selectedLabel)
            );
            setFilteredProjects(filtered);
        } else {
            setFilteredProjects(projects); // Show all if no label selected
        }
    }, [selectedLabel, projects]);

    // --- Event Handlers ---
    const handleStartProject = async (projectName: string) => {
        setError(null);
        // Prevent starting if already starting or running
        if (startingProjects.has(projectName) || activeProjects[projectName]) {
             console.warn(`Attempted to start ${projectName}, but it's already starting or running.`);
             return;
        }

        console.log(`\u25B6\uFE0F Initiating start for ${projectName}...`);
        // Add to starting set to update UI immediately
        setStartingProjects(prev => {
             const newSet = new Set(prev);
             newSet.add(projectName);
             startingProjectsRef.current = newSet; // Update ref immediately
             return newSet;
        });


        try {
            // No need to call prune here if it's not essential for starting
            // await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/prune-processes`, { method: 'POST' });

            const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/start-project`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectName }),
            });

            // 202 Accepted means the backend *started* the process, but it might not be ready yet
            if (!res.ok && res.status !== 202) {
                 const errorBody = await res.text();
                throw new Error(`Failed to initiate start for ${projectName}: ${res.status} ${errorBody}`);
            }

             if (res.status === 202) {
                  console.log(`Backend acknowledged start request for ${projectName}. Waiting for polling to confirm.`);
                  // Don't set active or open window here. Polling will handle it.
             } else {
                 // Handle unexpected success codes if necessary
                 console.log(`Start request for ${projectName} returned status ${res.status}`);
             }

        } catch (err: any) {
            console.error(`Error starting project ${projectName}:`, err);
            setError(`Failed to start ${projectName}: ${err.message || 'Unknown error'}`);
            // If start failed, remove from the 'starting' set
            setStartingProjects(prev => {
                const newSet = new Set(prev);
                newSet.delete(projectName);
                startingProjectsRef.current = newSet; // Update ref immediately
                return newSet;
            });
        }
    };

    const handleStopProject = async (projectName: string) => {
        setError(null);
        console.log(`\u23F9\uFE0F Stopping ${projectName}...`);
         // Optimistically update UI slightly faster, polling will correct if needed
         // setActiveProjects(prev => ({ ...prev, [projectName]: false }));

        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/stop-project`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectName }),
            });
             const respBody = await res.json(); // Get response message

            if (!res.ok) {
                throw new Error(respBody.error || `Failed to stop project: ${res.status}`);
            }
            console.log(`Stop request successful for ${projectName}: ${respBody.message}`);
            // Explicitly set to false on success. Polling will confirm.
            setActiveProjects((prev) => ({ ...prev, [projectName]: false }));
             // If it was somehow stuck in starting state, clear that too
             if (startingProjects.has(projectName)) {
                 setStartingProjects(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(projectName);
                    startingProjectsRef.current = newSet; // Update ref immediately
                    return newSet;
                 });
             }
        } catch (err: any) {
            console.error(`Error stopping project ${projectName}:`, err);
            setError(err.message || `An error occurred while stopping ${projectName}`);
            // Re-trigger a status check if stop failed, maybe it was already stopped
             checkAllProjectsStatus(projectsRef.current);
        }
    };

    const handleOpenProject = (port: string) => {
         console.log(`\ud83d\udd17 Opening project at port ${port}`);
         window.open(`http://100.114.43.102:${port}`, '_blank');
    };

    // --- Render ---
    return (
        // The className here allows theme switching via the ThemeContext and globals.css
        <div className={`container ${theme}`}>
            <button onClick={toggleTheme} className="theme-toggle-button">
                {theme === 'dark' ? '🌙 Dark' : '☀️ Light'}
            </button>
            <h1 className="projects-header">PROJECTS</h1>

            {error && <p className="error-message">Error: {error}</p>}

            <div className="filter-container">
                <label htmlFor="language-filter" className="filter-label">Filter by Language:</label>
                <select
                    id="language-filter"
                    className="filter-select"
                    value={selectedLabel || ''}
                    onChange={(e) => setSelectedLabel(e.target.value || null)}
                    aria-label="Filter projects by language"
                >
                    <option value="">All Languages</option>
                    {availableLabels.map((label) => (
                        <option key={label.id} value={label.id}>{label.name}</option>
                    ))}
                </select>
            </div>

            <div className="project-cards-container">
                {filteredProjects.length === 0 && !error && <p>Loading projects or no projects match filter...</p>}
                {filteredProjects.map((project) => {
                    const isRunning = activeProjects[project.project_name] ?? false;
                    const isStarting = startingProjects.has(project.project_name);

                    return (
                        <div key={project.project_name} className={`project-card ${isRunning ? 'active' : ''} ${isStarting ? 'starting' : ''}`}>
                            <h2>{project.project_name}</h2>
                            {project.icon_path && (
                                <Image
                                    className="project-icon"
                                    // Use the processed icon_path from the backend
                                    src={project.icon_path}
                                    alt={`${project.project_name} Icon`}
                                    width={50}
                                    height={50}
                                    onError={(e) => { e.currentTarget.style.display = 'none'; /* Hide if image fails */ }}
                                />
                            )}
                             {/* Use project.description from fetched data */}
                             <p className="project-description">{project.description || 'No description available.'}</p>
                            <div className="label-icons">
                                {project.cards.map((card) => (
                                    <div key={card.label_id} className="tooltip">
                                        <Image
                                            className="label-icon"
                                            src={`/label_icons/${card.label_name}.png`} // Path relative to /public
                                            alt={`${card.label_name} Icon`}
                                            width={30}
                                            height={30}
                                            onError={(e) => { e.currentTarget.src = '/label_icons/default.png'; /* Fallback icon */ }}
                                        />
                                         <span className="tooltiptext">{card.label_name}</span>
                                    </div>
                                ))}
                            </div>

                            <div className="project-actions">
                                {isStarting ? (
                                    <button className="action-button start-button" disabled>
                                        <span className="spinner"></span> Starting...
                                    </button>
                                ) : isRunning ? (
                                    <button
                                        className="action-button open-button"
                                        onClick={() => handleOpenProject(project.port)}
                                    >
                                        🚀 Open
                                    </button>
                                ) : (
                                    <button
                                        className="action-button start-button"
                                        onClick={() => handleStartProject(project.project_name)}
                                        disabled={isStarting} // Extra safety
                                    >
                                        ▶️ Start
                                    </button>
                                )}

                                <button
                                    className="action-button stop-button"
                                    onClick={() => handleStopProject(project.project_name)}
                                    disabled={!isRunning || isStarting} // Disable stop if not running or if currently starting
                                >
                                    ⏹️ Stop
                                </button>
                            </div>
                             <div className={`status-indicator ${isRunning ? 'running' : 'stopped'}`}>
                                 {isStarting ? 'Pending' : (isRunning ? 'Running' : 'Stopped')} on Port: {project.port}
                             </div>
                        </div>
                    );
                })}
            </div>
             {/* The <style jsx global> block is now removed */}
        </div>
    );
}