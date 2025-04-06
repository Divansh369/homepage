// FRONTEND (./app/page.tsx or similar)
"use client";

import { useEffect, useState, useRef, useCallback } from 'react';
import Image from 'next/image';
import { useTheme } from './ThemeContext'; // Assuming ThemeContext exists

// Interface for data associated with labels on a project card
interface CardData {
    card_id: string;
    card_name: string;
    card_description: string; // Often the project's description
    label_id: string;
    label_name: string;
}

// Interface for the main project data received from the backend
interface ProjectData {
    project_name: string;
    description: string;        // Project's own description
    icon_filename: string;      // Original filename from CSV/backend source
    icon_path: string;          // Frontend-usable path (e.g., /projects/...)
    startup_script: string;
    port: string;               // Port the project runs on
    scheme: 'http' | 'https';   // Protocol scheme (http or https)
    host: string;               // Hostname or IP address for the project URL
    cards: CardData[];          // Associated labels/cards for the project
}

// Interface for available labels used in the filter dropdown
interface Label {
    id: string;                 // Usually the label name
    name: string;               // Display name of the label
}

const POLLING_INTERVAL = 3000; // Check project status every 3 seconds (in milliseconds)

export default function Home() {
    // --- State Variables ---
    const [projects, setProjects] = useState<ProjectData[]>([]); // All projects from backend
    const [filteredProjects, setFilteredProjects] = useState<ProjectData[]>([]); // Projects after filtering
    const [selectedLabel, setSelectedLabel] = useState<string | null>(null); // Currently selected filter label ID
    const [availableLabels, setAvailableLabels] = useState<Label[]>([]); // Labels for the filter dropdown
    const [error, setError] = useState<string | null>(null); // Stores any operational errors
    const [activeProjects, setActiveProjects] = useState<Record<string, boolean>>({}); // Tracks confirmed running status (projectName: boolean)
    const [startingProjects, setStartingProjects] = useState<Set<string>>(new Set()); // Tracks projects currently in the process of starting
    const [projectJustStarted, setProjectJustStarted] = useState<ProjectData | null>(null); // Triggers auto-open side effect

    // --- Context and Refs ---
    const { theme, toggleTheme } = useTheme(); // Theme context for dark/light mode
    const intervalRef = useRef<NodeJS.Timeout | null>(null); // Holds the ID of the polling interval
    const projectsRef = useRef<ProjectData[]>([]); // Ref to access current projects inside interval closures
    const startingProjectsRef = useRef<Set<string>>(new Set()); // Ref to access current starting projects inside interval closures

    // --- Refs Synchronization ---
    // Keep refs updated whenever their corresponding state changes
    useEffect(() => {
        projectsRef.current = projects;
    }, [projects]);

    useEffect(() => {
        startingProjectsRef.current = startingProjects;
    }, [startingProjects]);

    // --- Initial Data Fetching ---
    useEffect(() => {
        const fetchData = async () => {
            setError(null);
            console.log("Fetching initial data...");
            try {
                // Fetch Projects
                console.log("Fetching projects from backend...");
                const projectsRes = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/projects`);
                if (!projectsRes.ok) {
                    const errorBody = await projectsRes.text();
                    throw new Error(`Failed to fetch projects: ${projectsRes.status} ${errorBody}`);
                }
                const projectsData: ProjectData[] = await projectsRes.json();
                console.log("Projects received:", projectsData);
                // Validate data structure minimally
                if (!Array.isArray(projectsData)) {
                   throw new Error("Invalid project data format received from backend.");
                }
                setProjects(projectsData);
                setFilteredProjects(projectsData); // Initialize filter with all projects
                projectsRef.current = projectsData; // Update ref immediately

                // Fetch Labels
                console.log("Fetching labels from backend...");
                const labelsRes = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/labels`);
                if (!labelsRes.ok) {
                    const errorBody = await labelsRes.text();
                    throw new Error(`Failed to fetch labels: ${labelsRes.status} ${errorBody}`);
                }
                const labelsData: Label[] = await labelsRes.json();
                 // Validate data structure minimally
                 if (!Array.isArray(labelsData)) {
                    throw new Error("Invalid label data format received from backend.");
                 }
                setAvailableLabels(labelsData);

                // Initial Status Check (if projects were loaded)
                if (projectsData.length > 0) {
                    console.log("Performing initial project status check...");
                    // Pass the freshly fetched data directly to avoid race conditions
                    checkAllProjectsStatus(projectsData, true);
                }

            } catch (err: any) {
                console.error("Error fetching initial data:", err);
                setError(`Failed to load initial data: ${err.message || 'Unknown error'}`);
            }
        };
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Runs only once on component mount

    // --- Project Status Polling Logic ---
    const checkAllProjectsStatus = useCallback(async (currentProjects: ProjectData[], isInitialCheck = false) => {
        // Prevent polling if project list is empty or not yet loaded
        if (!currentProjects || currentProjects.length === 0) {
            // console.log("Polling skipped: No projects data available."); // Optional log
            return;
        }
        if (!isInitialCheck) console.log("Polling project statuses..."); // Reduce logging noise

        // Use ref inside the callback to get the most up-to-date set of projects currently starting
        const currentStartingProjects = startingProjectsRef.current;

        // Create promises to check the status of each project concurrently
        const statusPromises = currentProjects.map(async (project) => {
            // Basic check for required project data
            if (!project || !project.project_name || !project.port) {
                console.warn("Skipping status check for invalid project data:", project);
                return { name: project?.project_name || 'unknown', running: false, projectData: project };
            }
            try {
                const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/check-project`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ port: project.port }),
                });
                if (!response.ok) {
                    // Log error but don't crash polling; return previous known state
                    console.error(`Error checking ${project.project_name} (Port: ${project.port}): ${response.status} ${await response.text()}`);
                    // Use activeProjects state directly here might be stale, better get from args if possible or manage state differently.
                    // Using a default 'false' or keeping previous state is safer. Let's keep previous:
                    return { name: project.project_name, running: activeProjects[project.project_name] ?? false, projectData: project };
                }
                const data = await response.json();
                // Return full project data along with its running status
                return { name: project.project_name, running: data.running, projectData: project };
            } catch (error) {
                // Log network or other errors; return previous known state
                console.error(`Network error checking project ${project.project_name}:`, error);
                return { name: project.project_name, running: activeProjects[project.project_name] ?? false, projectData: project };
            }
        });

        // Wait for all status checks to complete
        const results = await Promise.all(statusPromises);

        // Process results and update state immutably
        setActiveProjects(prevActive => {
            const newActiveState = { ...prevActive };
            let activeChanged = false;
            let projectToAutoOpen: ProjectData | null = null; // Store the project that just finished starting

            results.forEach(result => {
                if (!result || !result.name) return; // Skip invalid results

                const currentStatus = prevActive[result.name] ?? false; // Get previous status safely
                const newStatus = result.running;

                // Update state only if the status actually changed
                if (currentStatus !== newStatus) {
                    console.log(`Status change for ${result.name}: ${currentStatus} -> ${newStatus}`);
                    newActiveState[result.name] = newStatus;
                    activeChanged = true;

                    // Check if this project just finished the startup process
                    if (newStatus === true && currentStartingProjects.has(result.name)) {
                        console.log(`✅ Project ${result.name} confirmed running. Marking for auto-open.`);
                        projectToAutoOpen = result.projectData; // Mark this project for the auto-open side effect
                    }
                }
            });

            // Perform side-effects (updating 'starting' set and triggering auto-open) *after* calculating the new active state
            if (projectToAutoOpen) {
                const projectNameToRemove = projectToAutoOpen.project_name;
                // Update the 'starting' set state
                setStartingProjects(prevStarting => {
                    const newStarting = new Set(prevStarting);
                    if (newStarting.has(projectNameToRemove)) {
                        newStarting.delete(projectNameToRemove);
                        startingProjectsRef.current = newStarting; // Keep ref in sync
                        console.log(`Removed ${projectNameToRemove} from starting set.`);
                         // Trigger the separate effect to open the window by setting state
                         setProjectJustStarted(projectToAutoOpen);
                        return newStarting;
                    }
                    return prevStarting; // Return unchanged set if not found (shouldn't happen)
                });
            }

            // Return the new state only if changes occurred, otherwise return the previous state to prevent unnecessary re-renders
            return activeChanged ? newActiveState : prevActive;
        });

    }, [activeProjects]); // Dependency: Re-create checker if activeProjects map changes structure (rare)


    // --- Effect for Auto-Opening Window ---
    // This effect runs *only* when 'projectJustStarted' state changes to a valid project object
    useEffect(() => {
        if (projectJustStarted) {
            console.log(`\ud83d\udd17 Effect triggered: Opening window for ${projectJustStarted.project_name}`);
            // Use the dedicated handler function to construct the URL correctly
            handleOpenProject(
                projectJustStarted.scheme,
                projectJustStarted.host,
                projectJustStarted.port
            );
            // Reset the trigger state immediately to prevent re-opening on subsequent renders
            setProjectJustStarted(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectJustStarted]); // Dependency: Only run when projectJustStarted changes


    // --- Setup Polling Interval ---
    useEffect(() => {
        // Only start polling *after* the initial project data has been loaded
        if (projects.length > 0) {
            console.log(`Starting status polling interval (${POLLING_INTERVAL}ms)...`);

            // Clear any existing interval before setting a new one
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }

            // Set up the interval using the ref to access the latest project list
            intervalRef.current = setInterval(() => {
                // Pass the current list of projects from the ref to the check function
                checkAllProjectsStatus(projectsRef.current);
            }, POLLING_INTERVAL);
        }

        // Cleanup function: Clear the interval when the component unmounts or dependencies change
        return () => {
            if (intervalRef.current) {
                console.log("Clearing status polling interval.");
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [projects, checkAllProjectsStatus]); // Dependencies: Re-run effect if projects list or checker function changes


    // --- Filtering Logic ---
    // This effect updates the 'filteredProjects' list whenever the 'selectedLabel' or the main 'projects' list changes
    useEffect(() => {
        if (selectedLabel) {
            // Filter projects where at least one card's label_id matches the selectedLabel
            const filtered = projects.filter((project) =>
                project.cards.some((card) => card.label_id === selectedLabel)
            );
            setFilteredProjects(filtered);
        } else {
            // If no label is selected, show all projects
            setFilteredProjects(projects);
        }
    }, [selectedLabel, projects]); // Dependencies: Run when filter or project list changes

    // --- Event Handlers ---

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

        // Optional: Optimistically update UI slightly faster (can be removed if polling is sufficient)
        // setActiveProjects(prev => ({ ...prev, [projectName]: false }));
        // If it was starting, cancel that visually too
        // setStartingProjects(prev => {
        //     const newSet = new Set(prev);
        //     newSet.delete(projectName);
        //     startingProjectsRef.current = newSet;
        //     return newSet;
        // });

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
            // Polling will eventually confirm this too, but this provides faster UI feedback
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
            // Optional: Re-trigger a status check immediately if stop failed, as it might already be stopped
            const currentProjects = projectsRef.current.find(p => p.project_name === projectName);
            if (currentProjects) {
                 checkAllProjectsStatus([currentProjects]); // Check just this one
            } else {
                 checkAllProjectsStatus(projectsRef.current); // Check all as fallback
            }
        }
    };

    // Handles opening a project URL in a new tab
    const handleOpenProject = (scheme: 'http' | 'https', host: string, port: string) => {
        try {
            // Basic validation
            if (!scheme || !host || !port) {
                throw new Error(`Invalid arguments for opening project: scheme=${scheme}, host=${host}, port=${port}`);
            }

            const portNumber = parseInt(port, 10);
            let url: string;

            // Format host (handle IPv6 needing brackets)
            const formattedHost = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;

            // Construct base URL: scheme://host
            url = `${scheme}://${formattedHost}`;

            // Append port only if it's non-standard for the scheme (not 80 for http, not 443 for https)
            if (!isNaN(portNumber) && !(scheme === 'http' && portNumber === 80) && !(scheme === 'https' && portNumber === 443)) {
                url += `:${port}`;
            }

            console.log(`\ud83d\udd17 Opening project with constructed URL: ${url}`);
            window.open(url, '_blank', 'noopener,noreferrer'); // Open in new tab with security attributes

        } catch (error: any) {
            console.error("Error constructing or opening project URL:", error);
            setError(`Could not open project: ${error.message || 'Invalid configuration'}`);
        }
    };


    // --- Render ---
    return (
        // Apply theme class to the main container for CSS targeting
        <div className={`container ${theme}`}>
            {/* Theme Toggle Button */}
            <button onClick={toggleTheme} className="theme-toggle-button" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
                {theme === 'dark' ? '🌙 Dark' : '☀️ Light'} Mode
            </button>

            <h1 className="projects-header">PROJECT DASHBOARD</h1>

            {/* Display Global Errors */}
            {error && <p className="error-message">Error: {error}</p>}

            {/* Filter Section */}
            <div className="filter-container">
                <label htmlFor="language-filter" className="filter-label">Filter by Technology:</label>
                <select
                    id="language-filter"
                    className="filter-select"
                    value={selectedLabel || ''}
                    onChange={(e) => setSelectedLabel(e.target.value || null)} // Set to null if "All" is selected
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
                {/* Loading/Empty State Message */}
                {filteredProjects.length === 0 && !error && <p>Loading projects or no projects match the filter...</p>}

                {/* Map through filtered projects and render a card for each */}
                {filteredProjects.map((project) => {
                    // Basic check for valid project data before rendering card
                    if (!project || !project.project_name) return null;

                    // Determine current state for styling and button logic
                    const isRunning = activeProjects[project.project_name] ?? false;
                    const isStarting = startingProjects.has(project.project_name);

                    // Get scheme and host, providing safe defaults
                    const scheme = project.scheme || 'http';
                    const host = project.host || 'localhost'; // Default if backend doesn't provide

                    return (
                        <div key={project.project_name} className={`project-card ${isRunning ? 'active' : ''} ${isStarting ? 'starting' : ''}`}>
                            {/* Project Name */}
                            <h2>{project.project_name}</h2>

                            {/* Project Icon (optional) */}
                            {project.icon_path && project.icon_path !== '/label_icons/default.png' && (
                                <Image
                                    className="project-icon"
                                    src={project.icon_path} // Use the frontend-ready path from backend
                                    alt={`${project.project_name} Icon`}
                                    width={50}
                                    height={50}
                                    priority={false} // Set true for above-the-fold critical images
                                    // Hide image gracefully on error (e.g., 404)
                                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                />
                            )}

                            {/* Project Description */}
                            <p className="project-description">{project.description || 'No description provided.'}</p>

                            {/* Technology/Label Icons */}
                            <div className="label-icons">
                                {project.cards.map((card) => (
                                    <div key={card.label_id || card.label_name} className="tooltip">
                                        <Image
                                            className="label-icon"
                                            src={`/label_icons/${card.label_name}.png`} // Assumes icons are in public/label_icons/
                                            alt={`${card.label_name} Icon`}
                                            width={30}
                                            height={30}
                                            // Provide a fallback icon if specific label icon is missing
                                            onError={(e) => { e.currentTarget.src = '/label_icons/default.png'; }}
                                        />
                                        {/* Tooltip text on hover */}
                                        <span className="tooltiptext">{card.label_name}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Action Buttons */}
                            <div className="project-actions">
                                {isStarting ? (
                                    // Show "Starting..." button (disabled)
                                    <button className="action-button start-button" disabled>
                                        <span className="spinner" aria-hidden="true"></span> Starting...
                                    </button>
                                ) : isRunning ? (
                                    // Show "Open" button
                                    <button
                                        className="action-button open-button"
                                        // Call handler with scheme, host, and port
                                        onClick={() => handleOpenProject(scheme, host, project.port)}
                                        title={`Open project at ${scheme}://${host}:${project.port}`} // Tooltip for clarity
                                    >
                                        🚀 Open
                                    </button>
                                ) : (
                                    // Show "Start" button
                                    <button
                                        className="action-button start-button"
                                        onClick={() => handleStartProject(project.project_name)}
                                        disabled={isStarting} // Safety check: disable if somehow already starting
                                    >
                                        ▶️ Start
                                    </button>
                                )}

                                {/* Stop Button */}
                                <button
                                    className="action-button stop-button"
                                    onClick={() => handleStopProject(project.project_name)}
                                    // Disable if not running OR if it's currently in the starting phase
                                    disabled={!isRunning || isStarting}
                                    title={!isRunning ? "Project is not running" : (isStarting ? "Project is starting" : "Stop the project")}
                                >
                                    ⏹️ Stop
                                </button>
                            </div>

                            {/* Status Indicator */}
                            <div className={`status-indicator ${isRunning ? 'running' : (isStarting ? 'pending' : 'stopped')}`}>
                                {/* Display status text and location */}
                                {isStarting ? 'Pending' : (isRunning ? 'Running' : 'Stopped')} on {host}:{project.port}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}