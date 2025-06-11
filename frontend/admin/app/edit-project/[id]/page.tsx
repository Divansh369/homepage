// frontend/admin/app/edit-project/[id]/page.tsx
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
  loading: () => <div>Loading Labels...</div>
});

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || '';

export default function EditProjectPage() {
    const { theme } = useTheme();
    const router = useRouter();
    const params = useParams();
    const projectId = params.id as string;

    const [formState, setFormState] = useState({
        projectName: '', description: '', iconFilename: '', startCommand: '', stopCommand: '', scheme: 'http', port: '', host: '',
        github_url: '', deployed_url: '', notes: ''
    });
    const [selectedLabelOptions, setSelectedLabelOptions] = useState<MultiValue<SelectOption>>([]);
    const [availableLabels, setAvailableLabels] = useState<Label[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [isUpdating, setIsUpdating] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [uploadError, setUploadError] = useState<string | null>(null);
    
    useEffect(() => {
        if (!projectId) return;
        const fetchProjectData = async () => {
            setIsLoading(true); setError(null);
            try {
                const [projectRes, labelsRes] = await Promise.all([ fetch(`/api/project/${projectId}`), fetch(`/api/labels`) ]);
                if (!projectRes.ok) throw new Error(`Project fetch failed`);
                if (!labelsRes.ok) throw new Error(`Labels fetch failed`);
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
                    github_url: projectData.github_url || '',
                    deployed_url: projectData.deployed_url || '',
                    notes: projectData.notes || '',
                });
                const allOptions = labelsData.map(l => ({ value: String(l.id), label: `${l.name} (${l.label_type})` }));
                const currentLabels = allOptions.filter(opt => projectData.Labels.includes(parseInt(opt.value)));
                setSelectedLabelOptions(currentLabels);
            } catch (err: any) { setError(`Failed to load data: ${err.message}`); }
            finally { setIsLoading(false); }
        };
        fetchProjectData();
    }, [projectId]);

    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        setFormState(prevState => ({ ...prevState, [e.target.name]: e.target.value }));
    };
    
    const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.[0]) return;
        setUploadError(null);
        const formData = new FormData();
        formData.append('icon', e.target.files[0]);
        try {
            const res = await fetch(`/api/upload/icon`, { method: 'POST', body: formData });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error);
            setFormState(prevState => ({...prevState, iconFilename: result.filePath}));
        } catch (err: any) { setUploadError(err.message); }
    };

    const handleUpdateProject = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null); setSuccess(null); setIsUpdating(true);
        const payload = { ...formState, selectedLabels: selectedLabelOptions.map(option => parseInt(option.value)) };
        try {
            const response = await fetch(`/api/projects/${projectId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);
            setSuccess(`Project updated successfully!`);
            setTimeout(() => router.push('/admin/projects'), 1500);
        } catch (err: any) { setError(err.message); }
        finally { setIsUpdating(false); }
    };
    
    const iconPreviewSrc = formState.iconFilename ? `${BACKEND_URL}${formState.iconFilename}` : null;
    const getAllLabelOptions = useCallback((): SelectOption[] => availableLabels.map(l => ({ value: String(l.id), label: `${l.name} (${l.label_type})`})), [availableLabels]);

    if (isLoading) return <div className={`container ${theme}`}><p className="loading-indicator">Loading project...</p></div>;
    if (error && !formState.projectName) return <div className={`container ${theme}`}><p className="error-message">{error}</p></div>

    return (
        <div className={`container ${theme}`}>
            <div className="page-header"><h1>Edit: {formState.projectName}</h1><Link href="/admin/projects" className="back-link">← Back to Projects</Link></div>
            <div className="add-form-container">
                <form onSubmit={handleUpdateProject} className="add-form">
                    {error && <p className="error-message">{error}</p>}
                    {success && <p className="success-message">{success}</p>}
                    
                    <div className="form-group"><label>Project Icon</label>
                        <div style={{display: 'flex', alignItems: 'center', gap: '15px'}}>
                            {iconPreviewSrc && <Image src={iconPreviewSrc} alt="Icon" width={40} height={40} unoptimized />}
                            <input type="file" onChange={handleIconUpload} accept="image/*" />
                        </div>
                        {uploadError && <small className="error-message">{uploadError}</small>}
                    </div>

                    <div className="form-group"><label>Icon Path</label><input type="text" value={formState.iconFilename} readOnly/></div>
                    <div className="form-group"><label>Name *</label><input type="text" name="projectName" value={formState.projectName} onChange={handleFormChange} required /></div>
                    <div className="form-group"><label>Description</label><input type="text" name="description" value={formState.description} onChange={handleFormChange} /></div>
                    <div className="form-group"><label>Start Command *</label><input type="text" name="startCommand" value={formState.startCommand} onChange={handleFormChange} required /></div>
                    <div className="form-group"><label>Stop Command</label><input type="text" name="stopCommand" value={formState.stopCommand} onChange={handleFormChange} /></div>
                    <div className="form-group"><label>Port *</label><input type="number" name="port" value={formState.port} onChange={handleFormChange} required /></div>
                    <div className="form-group"><label>Host</label><input type="text" name="host" value={formState.host} onChange={handleFormChange} /></div>
                    <div className="form-group"><label>Scheme</label><select name="scheme" value={formState.scheme} onChange={handleFormChange}><option value="http">http</option><option value="https">https</option></select></div>
                    <div className="form-group"><label>GitHub URL</label><input type="url" name="github_url" value={formState.github_url} onChange={handleFormChange} /></div>
                    <div className="form-group"><label>Deployed URL</label><input type="url" name="deployed_url" value={formState.deployed_url} onChange={handleFormChange} /></div>
                    <div className="form-group"><label>Notes (Markdown supported)</label><textarea name="notes" value={formState.notes} onChange={handleFormChange} rows={5}></textarea></div>
                    <div className="form-group"><label>Labels</label><Select instanceId="edit-project-labels" isMulti name="labels" options={getAllLabelOptions()} value={selectedLabelOptions} onChange={(s) => setSelectedLabelOptions(s as any)} /></div>
                    <button type="submit" className="action-button add-button" disabled={isUpdating}>{isUpdating ? 'Saving...' : 'Save Changes'}</button>
                </form>
            </div>
        </div>
    );
}
