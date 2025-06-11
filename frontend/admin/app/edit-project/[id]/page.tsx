// frontend/app/edit-project/[id]/page.tsx
"use client";

import { useState, useEffect, FormEvent, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { MultiValue } from 'react-select';
import { useTheme } from '../../ThemeContext';
import Image from 'next/image';
import { Label, SelectOption } from '../../types';

const Select = dynamic(() => import('react-select'), {
  ssr: false,
  loading: () => <div style={{ minHeight: '38px', padding: '8px 10px', border: '1px solid #ccc', borderRadius: '4px', backgroundColor: '#eee', color: '#aaa' }}>Loading...</div>
});

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || '';

export default function EditProjectPage() {
    const { theme } = useTheme();
    const router = useRouter();
    const params = useParams();
    const projectId = params.id as string;

    const [formState, setFormState] = useState({ projectName: '', description: '', iconFilename: '', startCommand: '', stopCommand: '', scheme: 'http', port: '', host: '' });
    const [selectedLabelOptions, setSelectedLabelOptions] = useState<MultiValue<SelectOption>>([]);
    const [availableLabels, setAvailableLabels] = useState<Label[]>([]);
    
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [isUpdating, setIsUpdating] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [uploadError, setUploadError] = useState<string | null>(null);
    
    const getAllLabelOptions = useCallback((): SelectOption[] => {
        return availableLabels.map(l => ({ value: String(l.id), label: `${l.name} (${l.label_type})` }));
    }, [availableLabels]);

    useEffect(() => {
        if (!projectId) return;
        const fetchProjectData = async () => {
            setIsLoading(true);
            setError(null);
            try {
                // FIX: Use relative paths for the proxy
                const [projectRes, labelsRes] = await Promise.all([
                    fetch(`/api/project/${projectId}`),
                    fetch(`/api/labels`)
                ]);

                if (!projectRes.ok) {
                    const errorData = await projectRes.json();
                    throw new Error(`Project fetch failed: ${errorData.error || projectRes.status}`);
                }
                if (!labelsRes.ok) throw new Error(`Labels fetch failed: ${labelsRes.status}`);

                const projectData = await projectRes.json();
                const labelsData: Label[] = await labelsRes.json();
                
                setAvailableLabels(labelsData);
                setFormState({
                    projectName: projectData.project_name || '',
                    description: projectData.description || '',
                    iconFilename: projectData.icon_filename || '',
                    startCommand: projectData.start_command || '',
                    stopCommand: projectData.stop_command || '',
                    scheme: projectData.scheme || 'http',
                    port: String(projectData.port || ''),
                    host: projectData.host || '',
                });
                const allOptions = labelsData.map(l => ({ value: String(l.id), label: `${l.name} (${l.label_type})` }));
                const currentLabels = allOptions.filter(opt => projectData.Labels.includes(parseInt(opt.value)));
                setSelectedLabelOptions(currentLabels);
            } catch (err: any) { setError(`Failed to load data: ${err.message}`); }
            finally { setIsLoading(false); }
        };
        fetchProjectData();
    }, [projectId]);

    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFormState(prevState => ({ ...prevState, [e.target.name]: e.target.value }));
    };
    
    const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadError(null);
        const formData = new FormData();
        formData.append('icon', file);
        try {
            const res = await fetch(`/api/upload/icon`, { method: 'POST', body: formData });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || "Upload failed");
            setFormState(prevState => ({...prevState, iconFilename: result.filePath}));
        } catch (err: any) { setUploadError(err.message); }
    };

    const handleReactSelectChange = (newValue: unknown) => { setSelectedLabelOptions(newValue as MultiValue<SelectOption>); };

    const handleUpdateProject = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null); setSuccess(null); setIsUpdating(true);
        const selectedLabelIds = selectedLabelOptions.map(option => parseInt(option.value));
        const payload = { ...formState, selectedLabels: selectedLabelIds };
        try {
            const response = await fetch(`/api/projects/${projectId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || `Failed to update project`);
            setSuccess(`Project "${payload.projectName}" updated successfully!`);
            setTimeout(() => router.push('/'), 2000);
        } catch (err: any) { setError(`Failed to update project: ${err.message}`); }
        finally { setIsUpdating(false); }
    };
    
    if (isLoading) return <div className={`container ${theme}`}><p className="loading-indicator">Loading project data...</p></div>
    if (error && !formState.projectName) return <div className={`container ${theme}`}><p className="error-message">{error}</p><Link href="/">← Back to Dashboard</Link></div>

    const iconPreviewSrc = formState.iconFilename?.startsWith('/uploads') ? `${BACKEND_URL}${formState.iconFilename}` : formState.iconFilename;

    return (
        <div className={`container ${theme}`}>
            <div className="page-header"><h1>Edit Project: {formState.projectName}</h1><Link href="/" className="back-link">← Back to Dashboard</Link></div>
            <div className="add-form-container">
                <form onSubmit={handleUpdateProject} className="add-form">
                    {error && <p className="error-message">{error}</p>}
                    {success && <p className="success-message">{success}</p>}
                    <div className="form-group">
                        <label htmlFor="icon-upload">Project Icon</label>
                        <div style={{display: 'flex', alignItems: 'center', gap: '15px'}}>
                            {iconPreviewSrc && <Image src={iconPreviewSrc} alt="Icon Preview" width={40} height={40} style={{borderRadius: '5px', border: '1px solid var(--color-border)'}} unoptimized/>}
                            <input type="file" id="icon-upload" name="icon" onChange={handleIconUpload} accept="image/*" />
                        </div>
                        {uploadError && <small style={{color: 'var(--color-error-text)', marginTop: '5px'}}>{uploadError}</small>}
                        <small>Upload an image to replace the icon path below.</small>
                    </div>
                    <div className="form-group"><label htmlFor="iconFilename">Icon Path:</label><input type="text" id="iconFilename" name="iconFilename" value={formState.iconFilename} onChange={handleFormChange} placeholder="/uploads/icons/..." readOnly/></div>
                    <div className="form-group"><label htmlFor="projectName">Name:</label><input type="text" id="projectName" name="projectName" value={formState.projectName} onChange={handleFormChange} required /></div>
                    <div className="form-group"><label htmlFor="description">Description:</label><input type="text" id="description" name="description" value={formState.description} onChange={handleFormChange} /></div>
                    <div className="form-group"><label htmlFor="startCommand">Start Command:</label><input type="text" id="startCommand" name="startCommand" value={formState.startCommand} onChange={handleFormChange} required /></div>
                    <div className="form-group"><label htmlFor="stopCommand">Stop Command:</label><input type="text" id="stopCommand" name="stopCommand" value={formState.stopCommand} onChange={handleFormChange} /></div>
                    <div className="form-group"><label htmlFor="port">Port:</label><input type="number" id="port" name="port" value={formState.port} onChange={handleFormChange} required /></div>
                    <div className="form-group"><label htmlFor="scheme">Scheme:</label><select id="scheme" name="scheme" value={formState.scheme} onChange={handleFormChange}><option value="http">http</option><option value="https">https</option></select></div>
                    <div className="form-group"><label htmlFor="host">Host:</label><input type="text" id="host" name="host" value={formState.host} onChange={handleFormChange} /></div>
                    <div className="form-group label-selector"><label htmlFor="labels">Assign Labels:</label><Select instanceId="edit-project-label-select" inputId="labels" isMulti name="labels" options={getAllLabelOptions()} className="react-select-instance" classNamePrefix="react-select" value={selectedLabelOptions} onChange={handleReactSelectChange}/></div>
                    <button type="submit" className="action-button add-button" disabled={isUpdating}>{isUpdating ? 'Saving...' : 'Save Changes'}</button>
                </form>
            </div>
        </div>
    );
}
