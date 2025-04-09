// FRONTEND (./app/page.tsx or similar)
"use client";

import { useEffect, useState, useRef, useCallback } from 'react';
import Image from 'next/image';
import { useTheme } from './ThemeContext'; // Assuming ThemeContext exists

// (Keep existing interfaces: CardData, ProjectData, Label)
interface CardData {
    card_id: string;
    card_name: string;
    card_description: string;
    label_id: string;
    label_name: string;
}

interface ProjectData {
    project_name: string;
    description: string;
    icon_filename: string;
    icon_path: string;
    startup_script: string;
    port: string;
    scheme: 'http' | 'https';
    host: string;
    cards: CardData[];
}

interface Label {
    id: string;
    name: string;
}

// Helper Interface for initial status check results
interface InitialStatusResult {
    name: string;
    running: boolean;
}


const POLLING_INTERVAL = 3000;

export default function Home() {
    // (Keep existing state variables and refs)
    const [projects, setProjects] = useState<ProjectData[]>([]);
    const [filteredProjects, setFilteredProjects] = useState<ProjectData[]>([]);
    const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
    const [availableLabels, setAvailableLabels] = useState<Label[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [activeProjects, setActiveProjects] = useState<Record<string, boolean>>({});
    const [startingProjects, setStartingProjects] = useState<Set<string>>(new Set());
    const [projectJustStarted, setProjectJustStarted] = useState<ProjectData | null>(null);
    const { theme, toggleTheme } = useTheme();
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const projectsRef = useRef<ProjectData[]>([]);
    const startingProjectsRef = useRef<Set<string>>(new Set());

    // (Keep existing refs synchronization useEffects)
    useEffect(() => {
        projectsRef.current = projects;
    }, [projects]);

    useEffect(() => {
        startingProjectsRef.current = startingProjects;
    }, [startingProjects]);

    // --- MODIFIED Initial Data Fetching ---
    useEffect(() => {
        const fetchDataAndInitialStatus = async () => {
            setError(null);
            console.log("🚀 Starting initial data fetch and status check...");

            try {
                // --- Step 1: Fetch Projects and Labels Concurrently ---
                const projectsPromise = fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/projects`);
                const labelsPromise = fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/labels`);

                const [projectsResponse, labelsResponse] = await Promise.all([projectsPromise, labelsPromise]);

                // --- Step 2: Process Projects Response ---
                if (!projectsResponse.ok) {
                    throw new Error(`Failed to fetch projects: ${projectsResponse.status} ${await projectsResponse.text()}`);
                }
                const projectsData: ProjectData[] = await projectsResponse.json();
                console.log("Projects received:", projectsData);
                if (!Array.isArray(projectsData)) {
                    throw new Error("Invalid project data format received.");
                }

                // --- Step 3: Process Labels Response ---
                if (!labelsResponse.ok) {
                    throw new Error(`Failed to fetch labels: ${labelsResponse.status} ${await labelsResponse.text()}`);
                }
                const labelsData: Label[] = await labelsResponse.json();
                 if (!Array.isArray(labelsData)) {
                    throw new Error("Invalid label data format received.");
                 }

                // --- Step 4: Perform Initial Status Check Immediately (if projects exist) ---
                let initialStatusResults: InitialStatusResult[] = [];
                if (projectsData.length > 0) {
                    console.log("Performing initial project status check...");
                    const statusCheckPromises = projectsData.map(async (project): Promise<InitialStatusResult> => {
                         if (!project || !project.project_name || !project.port) {
                             console.warn("Skipping initial status check for invalid project data:", project);
                             return { name: project?.project_name || 'unknown', running: false };
                         }
                        try {
                            const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/check-project`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ port: project.port }),
                            });
                            // Don't throw here, just report status or default to false
                            if (!response.ok) {
                                console.error(`Initial check failed for ${project.project_name} (Port: ${project.port}): ${response.status}`);
                                return { name: project.project_name, running: false }; // Default to false on error during initial check
                            }
                            const data = await response.json();
                            return { name: project.project_name, running: data.running };
                        } catch (statusError) {
                            console.error(`Initial check network error for ${project.project_name}:`, statusError);
                            return { name: project.project_name, running: false }; // Default to false on error
                        }
                    });
                    // Wait for all initial status checks to complete
                    initialStatusResults = await Promise.all(statusCheckPromises);
                    console.log("Initial statuses received:", initialStatusResults);
                }

                // --- Step 5: Process Initial Statuses into State Format ---
                const initialActiveState: Record<string, boolean> = {};
                initialStatusResults.forEach(status => {
                    if (status.name !== 'unknown') {
                        initialActiveState[status.name] = status.running;
                    }
                });

                 // --- Step 6: Set All Initial State Together ---
                 console.log("Setting initial state for projects, labels, and statuses.");
                 setProjects(projectsData);
                 setFilteredProjects(projectsData); // Initialize filter
                 setAvailableLabels(labelsData);
                 setActiveProjects(initialActiveState); // Set the statuses determined *before* the first poll

                 // Update refs immediately after state is set
                 projectsRef.current = projectsData;


            } catch (err: any) {
                console.error("Error during initial data fetch or status check:", err);
                setError(`Failed to load initial data: ${err.message || 'Unknown error'}`);
                // Reset states in case of partial success followed by error
                setProjects([]);
                setFilteredProjects([]);
                setAvailableLabels([]);
                setActiveProjects({});
            }
        };

        fetchDataAndInitialStatus();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Runs only once on component mount


    // --- Project Status Polling Logic (Mostly Unchanged) ---
    // This function is now primarily for *subsequent* polls after the initial load
    const checkAllProjectsStatus = useCallback(async (currentProjects: ProjectData[], isInitialCheck = false) => {
        // Added isInitialCheck parameter just to potentially skip logging if needed,
        // but the main initial check is now handled in the fetchDataAndInitialStatus effect.
        if (!currentProjects || currentProjects.length === 0) {
            return;
        }
        // Avoid redundant logging if called programmatically right after initial fetch (though it shouldn't be)
        // if (!isInitialCheck) {
           console.log("Polling project statuses...");
        // }

        const currentStartingProjects = startingProjectsRef.current;

        const statusPromises = currentProjects.map(async (project) => {
             if (!project || !project.project_name || !project.port) {
                 console.warn("Polling: Skipping status check for invalid project data:", project);
                 // Return previous state if possible, or default
                 return { name: project?.project_name || 'unknown', running: activeProjects[project?.project_name] ?? false, projectData: project };
             }
            try {
                const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/check-project`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ port: project.port }),
                });
                if (!response.ok) {
                    console.error(`Polling: Error checking ${project.project_name} (Port: ${project.port}): ${response.status} ${await response.text()}`);
                    // Return previous known state on error during polling
                    return { name: project.project_name, running: activeProjects[project.project_name] ?? false, projectData: project };
                }
                const data = await response.json();
                return { name: project.project_name, running: data.running, projectData: project };
            } catch (error) {
                console.error(`Polling: Network error checking project ${project.project_name}:`, error);
                 // Return previous known state on error during polling
                return { name: project.project_name, running: activeProjects[project.project_name] ?? false, projectData: project };
            }
        });

        const results = await Promise.all(statusPromises);

        // (Keep the existing logic within setActiveProjects updater for handling status changes and auto-open)
        setActiveProjects(prevActive => {
            const newActiveState = { ...prevActive };
            let activeChanged = false;
            let projectToAutoOpen: ProjectData | null = null;

            results.forEach(result => {
                // Ensure result and name are valid before processing
                if (!result || !result.name || result.name === 'unknown') return;

                const currentStatus = prevActive[result.name] ?? false;
                const newStatus = result.running;

                if (currentStatus !== newStatus) {
                    console.log(`Polling: Status change for ${result.name}: ${currentStatus} -> ${newStatus}`);
                    newActiveState[result.name] = newStatus;
                    activeChanged = true;

                    if (newStatus === true && currentStartingProjects.has(result.name)) {
                        console.log(`Polling: ✅ Project ${result.name} confirmed running. Marking for auto-open.`);
                        projectToAutoOpen = result.projectData;
                    }
                }
            });

            if (projectToAutoOpen) {
                const projectNameToRemove = projectToAutoOpen.project_name;
                setStartingProjects(prevStarting => {
                    const newStarting = new Set(prevStarting);
                    if (newStarting.has(projectNameToRemove)) {
                        newStarting.delete(projectNameToRemove);
                        startingProjectsRef.current = newStarting;
                        console.log(`Polling: Removed ${projectNameToRemove} from starting set.`);
                        setProjectJustStarted(projectToAutoOpen); // Trigger auto-open effect
                        return newStarting;
                    }
                    return prevStarting;
                });
            }

            return activeChanged ? newActiveState : prevActive;
        });

    }, [activeProjects]); // Keep dependency

    // --- Effect for Auto-Opening Window (Unchanged) ---
    useEffect(() => {
        if (projectJustStarted) {
            console.log(`\ud83d\udd17 Effect triggered: Opening window for ${projectJustStarted.project_name}`);
            handleOpenProject(
                projectJustStarted.scheme,
                projectJustStarted.host,
                projectJustStarted.port
            );
            setProjectJustStarted(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectJustStarted]);

    // --- Setup Polling Interval (Unchanged, but depends on state set by new fetch logic) ---
    useEffect(() => {
        // Start polling only AFTER the initial fetch and status check is complete and projects state is set
        if (projects.length > 0) {
            console.log(`Starting status polling interval (${POLLING_INTERVAL}ms)...`);
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
            intervalRef.current = setInterval(() => {
                // Polling uses the ref, which was updated after the initial fetch
                checkAllProjectsStatus(projectsRef.current);
            }, POLLING_INTERVAL);
        }
        // Cleanup
        return () => {
            if (intervalRef.current) {
                console.log("Clearing status polling interval.");
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
        // Dependency on 'projects' ensures polling starts/restarts if the project list itself changes.
        // Dependency on checkAllProjectsStatus ensures the interval uses the latest version of the callback.
    }, [projects, checkAllProjectsStatus]);

    // --- Filtering Logic (Unchanged) ---
    useEffect(() => {
        if (selectedLabel) {
            const filtered = projects.filter((project) =>
                project.cards.some((card) => card.label_id === selectedLabel)
            );
            setFilteredProjects(filtered);
        } else {
            setFilteredProjects(projects);
        }
    }, [selectedLabel, projects]);

    // --- Event Handlers (Unchanged: handleStartProject, handleStopProject, handleOpenProject) ---
     // Handles starting a project
    const handleStartProject = async (projectName: string) => {
        setError(null); // Clear previous errors

        // Prevent starting if already starting or running
        if (startingProjects.has(projectName) || activeProjects[projectName]) {
            console.warn(`Attempted to start ${projectName}, but it's already starting or running.`);
            return;
        }

        console.log(`\u25B6\uFE0F Initiating start for ${projectName}...`);

        // Immediately update UI to show "Starting..."
        setStartingProjects(prev => {
            const newSet = new Set(prev);
            newSet.add(projectName);
            startingProjectsRef.current = newSet; // Update ref immediately
            return newSet;
        });

        try {
            // Call the backend API to start the project
            const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/start-project`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectName }),
            });

            // Backend should respond with 202 Accepted if start initiated successfully
            if (res.status === 202) {
                 console.log(`Backend acknowledged start request for ${projectName}. Waiting for polling to confirm.`);
                 // No further action needed here; polling will detect when it's running
            } else if (!res.ok) {
                // Handle other non-OK responses as errors
                const errorBody = await res.text();
                throw new Error(`Failed to initiate start for ${projectName}: ${res.status} ${errorBody}`);
            } else {
                // Handle unexpected success codes (e.g., 200 OK) if necessary
                console.log(`Start request for ${projectName} returned unexpected status ${res.status}`);
            }

        } catch (err: any) {
            console.error(`Error starting project ${projectName}:`, err);
            setError(`Failed to start ${projectName}: ${err.message || 'Unknown error'}`);
            // If start request failed, remove from the 'starting' set to revert UI
            setStartingProjects(prev => {
                const newSet = new Set(prev);
                newSet.delete(projectName);
                startingProjectsRef.current = newSet; // Update ref immediately
                return newSet;
            });
        }
    };

    // Handles stopping a project
    const handleStopProject = async (projectName: string) => {
        setError(null); // Clear previous errors
        console.log(`\u23F9\uFE0F Stopping ${projectName}...`);

        try {
            // Call the backend API to stop the project
            const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/stop-project`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectName }),
            });

             const respBody = await res.json(); // Expecting JSON response { message: "..." } or { error: "..." }

            if (!res.ok) {
                throw new Error(respBody.error || `Failed to stop project: ${res.status}`);
            }

            console.log(`Stop request successful for ${projectName}: ${respBody.message}`);

            // Explicitly set status to false on successful stop confirmation from backend
            setActiveProjects((prev) => ({ ...prev, [projectName]: false }));

            // Ensure it's also removed from 'starting' set if it was stuck there
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
            // Optional: Re-trigger a status check immediately if stop failed
            const currentProject = projectsRef.current.find(p => p.project_name === projectName);
            if (currentProject) {
                 // Check just this one project's status again quickly
                 const quickCheck = async () => {
                    try {
                        const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/check-project`, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ port: currentProject.port })
                        });
                        if(response.ok) {
                            const data = await response.json();
                            setActiveProjects(prev => ({...prev, [projectName]: data.running}));
                        }
                    } catch (quickErr) { console.error("Quick status re-check failed:", quickErr); }
                 };
                 quickCheck();
            }
        }
    };

    // Handles opening a project URL in a new tab
    const handleOpenProject = (scheme: 'http' | 'https', host: string, port: string) => {
        try {
            if (!scheme || !host || !port) { throw new Error(`Invalid arguments`); }
            const portNumber = parseInt(port, 10);
            let url: string;
            const formattedHost = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
            url = `${scheme}://${formattedHost}`;
            if (!isNaN(portNumber) && !(scheme === 'http' && portNumber === 80) && !(scheme === 'https' && portNumber === 443)) {
                url += `:${port}`;
            }
            console.log(`\ud83d\udd17 Opening project with constructed URL: ${url}`);
            window.open(url, '_blank', 'noopener,noreferrer');
        } catch (error: any) {
            console.error("Error constructing or opening project URL:", error);
            setError(`Could not open project: ${error.message || 'Invalid configuration'}`);
        }
    };

    // --- Render (Unchanged) ---
    return (
        <div className={`container ${theme}`}>
            {/* Theme Toggle Button */}
            <button onClick={toggleTheme} className="theme-toggle-button" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
                {theme === 'dark' ? '🌙 Dark' : '☀️ Light'} Mode
            </button>
            <h1 className="projects-header">PROJECT DASHBOARD</h1>
            {error && <p className="error-message">Error: {error}</p>}
            {/* Filter Section */}
            <div className="filter-container">
                <label htmlFor="language-filter" className="filter-label">Filter by Technology:</label>
                <select
                    id="language-filter"
                    className="filter-select"
                    value={selectedLabel || ''}
                    onChange={(e) => setSelectedLabel(e.target.value || null)}
                    aria-label="Filter projects by technology"
                >
                    <option value="">All Technologies</option>
                    {availableLabels.map((label) => (
                        <option key={label.id} value={label.id}>{label.name}</option>
                    ))}
                </select>
            </div>
            {/* Project Cards Container */}
            <div className="project-cards-container">
                {filteredProjects.length === 0 && !error && <p>Loading projects or no projects match the filter...</p>}
                {filteredProjects.map((project) => {
                    if (!project || !project.project_name) return null;
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
                                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                />
                            )}
                            <p className="project-description">{project.description || 'No description provided.'}</p>
                            <div className="label-icons">
                                {project.cards.map((card) => (
                                    <div key={card.label_id || card.label_name} className="tooltip">
                                        <Image
                                            className="label-icon"
                                            src={`/label_icons/${card.label_name}.png`}
                                            alt={`${card.label_name} Icon`}
                                            width={30} height={30}
                                            onError={(e) => { e.currentTarget.src = '/label_icons/default.png'; }}
                                        />
                                        <span className="tooltiptext">{card.label_name}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="project-actions">
                                {isStarting ? (
                                    <button className="action-button start-button" disabled>
                                        <span className="spinner" aria-hidden="true"></span> Starting...
                                    </button>
                                ) : isRunning ? (
                                    <button
                                        className="action-button open-button"
                                        onClick={() => handleOpenProject(scheme, host, project.port)}
                                        title={`Open project at ${scheme}://${host}:${project.port}`}
                                    > 🚀 Open </button>
                                ) : (
                                    <button
                                        className="action-button start-button"
                                        onClick={() => handleStartProject(project.project_name)}
                                        disabled={isStarting}
                                    > ▶️ Start </button>
                                )}
                                <button
                                    className="action-button stop-button"
                                    onClick={() => handleStopProject(project.project_name)}
                                    disabled={!isRunning || isStarting}
                                    title={!isRunning ? "Project is not running" : (isStarting ? "Project is starting" : "Stop the project")}
                                > ⏹️ Stop </button>
                            </div>
                            <div className={`status-indicator ${isRunning ? 'running' : (isStarting ? 'pending' : 'stopped')}`}>
                                {isStarting ? 'Pending' : (isRunning ? 'Running' : 'Stopped')} on {host}:{project.port}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}