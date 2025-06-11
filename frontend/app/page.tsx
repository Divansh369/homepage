// frontend/app/page.tsx
"use client";

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import type { MultiValue } from 'react-select';
import { useTheme } from './ThemeContext';
import { ProjectGrid } from './components/ProjectGrid';
import { ProjectData, Label, SelectOption } from './types';
import { useProjectStore, useAuth } from '../store/projectStore';
import { shallow } from 'zustand/shallow';

const Select = dynamic(() => import('react-select'), {
  ssr: false,
  loading: () => <div className='filter-select filter-multiselect' style={{ minHeight: '38px' }}>Loading...</div>
});

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:1024';

export default function Home() {
    const { isAuthenticated, checkAuthStatus } = useAuth();

    const {
        allProjects, availableLabels, activeProjects, startingProjects,
        isLoading, error, updateStatusFromSocket
    } = useProjectStore(state => ({
        allProjects: state.allProjects,
        availableLabels: state.availableLabels,
        activeProjects: state.activeProjects,
        startingProjects: state.startingProjects,
        isLoading: state.isLoading,
        error: state.error,
        updateStatusFromSocket: state.updateStatusFromSocket,
    }), shallow);
    
    const { fetchInitialData, handleStartProject, handleStopProject, handleDeleteProject, saveOrder, setAllProjects } = useProjectStore();

    const [filteredProjects, setFilteredProjects] = useState<ProjectData[]>([]);
    const [selectedLanguageOptions, setSelectedLanguageOptions] = useState<MultiValue<SelectOption>>([]);
    const [selectedUtilityOptions, setSelectedUtilityOptions] = useState<MultiValue<SelectOption>>([]);
    const [searchTerm, setSearchTerm] = useState<string>('');
    const [isEditMode, setIsEditMode] = useState<boolean>(false);
    const [customPort, setCustomPort] = useState<string>('');
    
    const { theme, toggleTheme } = useTheme();
    const originalOrderRef = useRef<ProjectData[]>([]);
    
    useEffect(() => {
        fetchInitialData();
        checkAuthStatus();
    }, [fetchInitialData, checkAuthStatus]);
    
    useEffect(() => {
        const ws = new WebSocket(WS_URL);
        ws.onopen = () => console.log('✅ WebSocket connection established.');
        ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                if (message.type === 'STATUS_UPDATE') {
                    updateStatusFromSocket(message.payload.projectName, message.payload.isRunning);
                }
            } catch (error) { console.error("WS Message Error:", error); }
        };
        ws.onclose = () => console.log('❗️ WebSocket connection closed.');
        ws.onerror = (error) => console.error("WebSocket error:", error);
        return () => { if (ws.readyState === 1) ws.close(); };
    }, [updateStatusFromSocket]);
    
    const handleOpenProject = useCallback((scheme: 'http' | 'https', host: string, port: string) => {
      window.open(`${scheme}://${host}:${port}`, '_blank', 'noopener,noreferrer');
    }, []);

    const handleOpenCustomPort = useCallback(() => {
      const port = customPort.trim();
      if (!port || !/^\d+$/.test(port)) return;
      handleOpenProject('http', 'localhost', port);
      setCustomPort('');
    }, [customPort, handleOpenProject]);

    useEffect(() => {
        const currentLangs = new Set(selectedLanguageOptions.map(o => o.value));
        const currentUtils = new Set(selectedUtilityOptions.map(o => o.value));
        const search = searchTerm.toLowerCase().trim();
        const newFiltered = allProjects.filter(proj => {
            if (isEditMode) return true;
            const nameMatch = search ? proj.project_name.toLowerCase().includes(search) : true;
            if (!nameMatch) return false;
            const projectLabelIds = new Set(proj.cards.map(c => String(c.label_id)));
            const langMatch = currentLangs.size > 0 ? [...currentLangs].some(id => projectLabelIds.has(id)) : true;
            const utilMatch = currentUtils.size > 0 ? [...currentUtils].some(id => projectLabelIds.has(id)) : true;
            return langMatch && utilMatch;
        });
        setFilteredProjects(newFiltered);
    }, [searchTerm, selectedLanguageOptions, selectedUtilityOptions, allProjects, isEditMode]);
    
    const handleEnterEditMode = () => { originalOrderRef.current = [...allProjects]; setIsEditMode(true); };
    const handleCancelEditMode = () => { setAllProjects(originalOrderRef.current); setIsEditMode(false); };
    const handleSaveOrder = () => {
        const orderedIds = filteredProjects.map(p => p.id);
        saveOrder(orderedIds, filteredProjects);
        setIsEditMode(false);
    };

    const getLanguageOptions = useCallback((labels: Label[]): SelectOption[] => labels.filter(l => l.label_type === 'language').map(l => ({ value: String(l.id), label: l.name })), []);
    const getUtilityOptions = useCallback((labels: Label[]): SelectOption[] => labels.filter(l => l.label_type === 'utility').map(l => ({ value: String(l.id), label: l.name })), []);

    return (
        <div className={`container ${theme}`}>
            <nav className="top-navbar">
                <div className="navbar-section filters-section">
                    <div className="filter-container search-container"><label>Search:</label><input type="search" className="navbar-control" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} disabled={isEditMode} /></div>
                    <div className="filter-container react-select-container"><label>Language:</label><Select options={getLanguageOptions(availableLabels)} isMulti onChange={(s) => setSelectedLanguageOptions(s as any)} isDisabled={isEditMode} className="react-select-instance" classNamePrefix="react-select"/></div>
                    <div className="filter-container react-select-container"><label>Utility:</label><Select options={getUtilityOptions(availableLabels)} isMulti onChange={(s) => setSelectedUtilityOptions(s as any)} isDisabled={isEditMode} className="react-select-instance" classNamePrefix="react-select"/></div>
                </div>
                <div className="navbar-section custom-port-section">
                    <div className="filter-container custom-port-opener"><label>Open Port:</label><input type="text" className="custom-port-input navbar-control" value={customPort} onChange={(e) => setCustomPort(e.target.value)} /><button onClick={handleOpenCustomPort} className="action-button open-custom-button">🔗 Open</button></div>
                </div>
                <div className="navbar-section add-buttons-section">
                    {isAuthenticated && (isEditMode ? (<> <button onClick={handleSaveOrder} className="action-button start-button">Save Order</button> <button onClick={handleCancelEditMode} className="action-button stop-button">Cancel</button> </>) : (<> <Link href="/admin" className="action-button nav-edit-button" style={{backgroundColor: '#6f42c1', borderColor: '#6f42c1', color: 'white'}}>Admin Panel</Link> <button onClick={handleEnterEditMode} className="action-button nav-edit-button">Edit Layout</button> <Link href="/add-project" className="action-button nav-add-button">Add Project</Link> </>))}
                 </div>
                 <button onClick={toggleTheme} className="theme-toggle-button-nav"> {theme === 'dark' ? '🌙' : '☀️'} </button>
            </nav>
            <main className="main-content">
                <h1 className="projects-header">PROJECT DASHBOARD</h1>
                {isLoading && <p className="loading-indicator">Loading...</p>}
                {error && <p className="error-message">{error}</p>}
                {!isLoading && (
                    <ProjectGrid isAuthenticated={isAuthenticated ?? false} projects={filteredProjects} setProjects={setFilteredProjects} activeProjects={activeProjects} startingProjects={startingProjects} isEditMode={isEditMode} handleStartProject={handleStartProject} handleStopProject={handleStopProject} handleOpenProject={handleOpenProject} handleDeleteProject={handleDeleteProject} />
                )}
            </main>
        </div>
    );
}
