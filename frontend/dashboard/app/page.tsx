// frontend/dashboard/app/page.tsx
"use client";

import { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import type { MultiValue } from 'react-select';
import { useTheme } from './ThemeContext';
import { useProjectStore } from '../store/projectStore';
import { shallow } from 'zustand/shallow';
import { ProjectData, Label, SelectOption } from './types';
import { ProjectCard } from './components/ProjectCard';
import { ProjectDetailModal } from './components/ProjectDetailModal';
import { motion, AnimatePresence } from 'framer-motion';

const Select = dynamic(() => import('react-select'), {
  ssr: false,
  loading: () => <div className='filter-select filter-multiselect' style={{ minHeight: '38px' }}>Loading...</div>
});

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:1024';

const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const cardVariants = { hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } };

export default function Home() {
    const { theme, toggleTheme } = useTheme();

    const {
        allProjects, availableLabels, activeProjects, isLoading, error, fetchInitialData, updateStatusFromSocket
    } = useProjectStore(state => ({ ...state }), shallow);
    
    // --- LOCAL UI STATE ---
    const [filteredProjects, setFilteredProjects] = useState<ProjectData[]>([]);
    const [selectedProject, setSelectedProject] = useState<ProjectData | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedLanguageOptions, setSelectedLanguageOptions] = useState<MultiValue<SelectOption>>([]);
    const [selectedUtilityOptions, setSelectedUtilityOptions] = useState<MultiValue<SelectOption>>([]);
    const [showOnlyRunning, setShowOnlyRunning] = useState(false); // New state for the toggle

    useEffect(() => { fetchInitialData() }, [fetchInitialData]);
    useEffect(() => { /* WebSocket logic remains the same */ }, [updateStatusFromSocket]);
    
    // --- UPDATED FILTERING LOGIC ---
    useEffect(() => {
        const currentLangs = new Set(selectedLanguageOptions.map(o => o.value));
        const currentUtils = new Set(selectedUtilityOptions.map(o => o.value));
        const search = searchTerm.toLowerCase().trim();

        const newFiltered = allProjects.filter(proj => {
            const isRunning = activeProjects[proj.project_name] ?? false;

            // Apply all filters
            if (showOnlyRunning && !isRunning) return false;
            if (search && !proj.project_name.toLowerCase().includes(search)) return false;
            
            const projectLabelIds = new Set(proj.cards.map(c => String(c.label_id)));
            if (currentLangs.size > 0 && ![...currentLangs].some(id => projectLabelIds.has(id))) return false;
            if (currentUtils.size > 0 && ![...currentUtils].some(id => projectLabelIds.has(id))) return false;
            
            return true;
        });

        setFilteredProjects(newFiltered.sort((a, b) => a.order - b.order));
    }, [allProjects, searchTerm, selectedLanguageOptions, selectedUtilityOptions, showOnlyRunning, activeProjects]);

    const handleOpenProject = useCallback((scheme: 'http' | 'https', host: string, port: string) => { window.open(`${scheme}://${host}:${port}`, '_blank', 'noopener,noreferrer'); }, []);
    const getLanguageOptions = useCallback((labels: Label[]): SelectOption[] => labels.filter(l => l.label_type === 'language').map(l => ({ value: String(l.id), label: l.name })), []);
    const getUtilityOptions = useCallback((labels: Label[]): SelectOption[] => labels.filter(l => l.label_type === 'utility').map(l => ({ value: String(l.id), label: l.name })), []);

    return (
        <div className={`container ${theme}`}>
            <AnimatePresence>{selectedProject && (<ProjectDetailModal project={selectedProject} onClose={() => setSelectedProject(null)} />)}</AnimatePresence>
            <nav className="top-navbar">
                <div className="navbar-section filters-section">
                    <div className="filter-container"><label>Search:</label><input type="search" className="navbar-control" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} /></div>
                    <div className="filter-container react-select-container"><label>Language:</label><Select options={getLanguageOptions(availableLabels)} isMulti onChange={(s) => setSelectedLanguageOptions(s as any)} className="react-select-instance" classNamePrefix="react-select"/></div>
                    <div className="filter-container react-select-container"><label>Utility:</label><Select options={getUtilityOptions(availableLabels)} isMulti onChange={(s) => setSelectedUtilityOptions(s as any)} className="react-select-instance" classNamePrefix="react-select"/></div>
                    {/* --- NEW TOGGLE SWITCH --- */}
                    <div className="filter-container">
                        <label className="filter-label">Only Running</label>
                        <label className="toggle-switch">
                            <input type="checkbox" checked={showOnlyRunning} onChange={e => setShowOnlyRunning(e.target.checked)} />
                            <span className="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                <button onClick={toggleTheme} className="theme-toggle-button-nav"> {theme === 'dark' ? '🌙' : '☀️'} </button>
            </nav>
            <main className="main-content">
                <h1 className="projects-header">PROJECT DASHBOARD</h1>
                {isLoading && <p>Loading...</p>}
                {error && <p>{error}</p>}
                <motion.div className="project-cards-container" variants={containerVariants} initial="hidden" animate="visible">
                    {filteredProjects.map((project) => (
                        <motion.div key={project.id} variants={cardVariants}>
                            <ProjectCard project={project} isRunning={activeProjects[project.project_name] ?? false} handleOpenProject={handleOpenProject} onCardClick={() => setSelectedProject(project)} />
                        </motion.div>
                    ))}
                </motion.div>
            </main>
        </div>
    );
}
