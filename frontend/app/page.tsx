"use client";

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useTheme } from './ThemeContext';

interface CardData {
    card_id: string;
    card_name: string;
    card_description: string;
    label_id: string;
    label_name: string;
}

interface ProjectData {
    project_name: string;
    icon_filename: string;
    startup_script: string;
    port: string;
    cards: CardData[];
}

interface Label {
    id: string;
    name: string;
}

export default function Home() {
    const [projects, setProjects] = useState<ProjectData[]>([]);
    const [filteredProjects, setFilteredProjects] = useState<ProjectData[]>([]);
    const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
    const [availableLabels, setAvailableLabels] = useState<Label[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [customPort, setCustomPort] = useState<string>('');
    const { theme, toggleTheme } = useTheme();

    useEffect(() => {
        const fetchData = async () => {
            try {
                console.log("Fetching projects from backend...");
                console.log(process.env.NEXT_PUBLIC_BACKEND_URL);
                const projectsRes = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/projects`);
                if (!projectsRes.ok) {
                    throw new Error(`Failed to fetch projects: ${projectsRes.status}`);
                }
                const projectsData: ProjectData[] = await projectsRes.json();
                console.log("Projects fetched:", projectsData);
                setProjects(projectsData);
                setFilteredProjects(projectsData);

                console.log("Fetching labels from backend...");
                const labelsRes = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/labels`);
                if (!labelsRes.ok) {
                    throw new Error(`Failed to fetch labels: ${labelsRes.status}`);
                }
                const labelsData: Label[] = await labelsRes.json();
                console.log("Labels fetched:", labelsData);
                setAvailableLabels(labelsData);
            } catch (err: any) {
                console.error("Error fetching data:", err);
                setError(err.message || 'An error occurred');
            }
        };
        fetchData();
    }, []);

    useEffect(() => {
        console.log("Filtering projects based on label selection:", selectedLabel);
        if (selectedLabel) {
            const filtered = projects.filter((project) =>
                project.cards.some((card) => card.label_id === selectedLabel)
            );
            console.log("Filtered projects:", filtered);
            setFilteredProjects(filtered);
        } else {
            console.log("No label selected, showing all projects");
            setFilteredProjects(projects);
        }
    }, [selectedLabel, projects]);

    const handleStartProject = async (projectName: string, port: string) => {
        try {
            console.log(`Pruning unused processes before starting: ${projectName}`);
            await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/prune-processes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });

            console.log(`Starting project: ${projectName}`);
            const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/start-project`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectName }),
            });

            if (!res.ok) {
                throw new Error(`Failed to start project: ${res.status}`);
            }

            console.log(`Project started successfully, opening: http://100.114.43.102:${port}`);
            window.open(`http://100.114.43.102:${port}`, '_blank');
        } catch (err: any) {
            console.error("Error starting project:", err);
            setError(err.message || 'An error occurred while starting the project');
        }
    };

    const handleCustomPortNavigation = () => {
        if (/^\d+$/.test(customPort)) {
            window.open(`http://100.114.43.102:${customPort}`, '_blank');
            setError(null);
        } else {
            setError('Invalid port number');
        }
    };

    return (
        <div>
            <button onClick={toggleTheme} className="theme-toggle-button">
                {theme === 'dark' ? '🌙' : '☀️'}
            </button>
            <h1 className="projects-header">PROJECTS</h1>

            {error && <p style={{ color: 'red' }}>{error}</p>}

            <div className="filter-container">
                <select
                    id="label-select"
                    className="filter-select"
                    value={selectedLabel || ''}
                    onChange={(e) => setSelectedLabel(e.target.value || null)}
                >
                    <option value="">Language</option>
                    {availableLabels.map((label) => (
                        <option key={label.id} value={label.id}>{label.name}</option>
                    ))}
                </select>
            </div>

            <div className="port-input-container">
                <input
                    type="number"
                    placeholder="Enter port number"
                    value={customPort}
                    onChange={(e) => setCustomPort(e.target.value)}
                    className="port-input"
                />
                <button className="navigate-button" onClick={handleCustomPortNavigation}>
                    Go to Port
                </button>
            </div>

            <div className="project-cards-container">
                {filteredProjects.map((project) => {
                    const description = project.cards.length > 0 ? project.cards[0].card_description : '';
                    return (
                        <div key={project.project_name} className="project-card">
    <h2>{project.project_name}</h2>    
    <Image
        className="project-icon"
        src={`/projects/${project.project_name}/${project.icon_filename}`}
        alt={`${project.project_name} Icon`}
        width={50}
        height={50}
    />
        <p className="project-description">{description}</p> {/* Move description up */}

    <div className="label-icons">
        {project.cards.map((card) => (
            <Image
                key={card.label_id}
                className="label-icon"
                src={`/label_icons/${card.label_name}.png`}
                alt={`${card.label_name} Icon`}
                width={30}
                height={30}
            />
        ))}
    </div>

    <button className="start-button" onClick={() => handleStartProject(project.project_name, project.port)}>
        Start {project.project_name}
    </button>
</div>

                    );
                })}
            </div>
        </div>
    );
}
