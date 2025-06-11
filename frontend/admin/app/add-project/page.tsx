// frontend/admin/app/add-project/page.tsx
"use client";

import { useState, useEffect, FormEvent, useCallback } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { MultiValue } from 'react-select';
import { useTheme } from '../ThemeContext';
import Image from 'next/image';
import { Label, SelectOption } from '../types';

const Select = dynamic(() => import('react-select'), {
  ssr: false,
  loading: () => <div style={{minHeight: '38px', padding: '8px 10px', border: '1px solid #ccc', borderRadius: '4px', backgroundColor: '#eee', color: '#aaa'}}>Loading...</div>
});

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || '';

export default function AddProjectPage() {
  const { theme } = useTheme();
  const [availableLabels, setAvailableLabels] = useState<Label[]>([]);
  const [labelsLoading, setLabelsLoading] = useState<boolean>(true);
  const [isAddingProject, setIsAddingProject] = useState<boolean>(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [formState, setFormState] = useState({
    projectName: '',
    description: '',
    iconFilename: '',
    startCommand: '',
    stopCommand: '',
    scheme: 'http',
    port: '',
    host: '',
    github_url: '',    // New State
    deployed_url: '', // New State
    notes: '',        // New State
  });
  const [selectedLabelOptions, setSelectedLabelOptions] = useState<MultiValue<SelectOption>>([]);

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormState(prevState => ({ ...prevState, [e.target.name]: e.target.value }));
  };

  const clearForm = () => {
    setFormState({
        projectName: '', description: '', iconFilename: '', startCommand: '', stopCommand: '', scheme: 'http', port: '', host: '',
        github_url: '', deployed_url: '', notes: ''
    });
    setSelectedLabelOptions([]);
  };

  useEffect(() => {
    const fetchPageLabels = async () => {
        setLabelsLoading(true);
        try {
            const res = await fetch('/api/labels');
            if (!res.ok) throw new Error(`Labels fetch failed`);
            const data: Label[] = await res.json();
            setAvailableLabels(data);
        } catch (err: any) { setAddError(err.message); }
        finally { setLabelsLoading(false); }
    };
    fetchPageLabels();
  }, []);

  const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files?.[0]) return;
      setUploadError(null);
      const formData = new FormData();
      formData.append('icon', e.target.files[0]);
      try {
          const res = await fetch(`/api/upload/icon`, { method: 'POST', body: formData });
          const result = await res.json();
          if (!res.ok) throw new Error(result.error);
          setFormState(prevState => ({ ...prevState, iconFilename: result.filePath }));
      } catch (err: any) { setUploadError(err.message); }
  };

  const handleAddProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAddError(null); setAddSuccess(null);
    if (!formState.projectName || !formState.startCommand || !formState.port) {
      setAddError("Name, Start Command, and Port are required.");
      return;
    }
    setIsAddingProject(true);
    const payload = { ...formState, selectedLabels: selectedLabelOptions.map(opt => parseInt(opt.value)) };
    try {
      const response = await fetch(`/api/add-project`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setAddSuccess(`Project "${payload.projectName}" added!`);
      clearForm();
    } catch (err: any) { setAddError(err.message); }
    finally { setIsAddingProject(false); }
  };
  
  const iconPreviewSrc = formState.iconFilename ? `${BACKEND_URL}${formState.iconFilename}` : null;
  const getAllLabelOptions = useCallback((): SelectOption[] => availableLabels.map(l => ({ value: String(l.id), label: `${l.name} (${l.label_type})`})), [availableLabels]);

  return (
    <div className={`container ${theme}`}>
      <div className="page-header"><h1>Add New Project</h1><Link href="/admin/projects" className="back-link">← Back to Admin</Link></div>
      <div className="add-form-container">
        <form onSubmit={handleAddProject} className="add-form">
          {addError && <p className="error-message">{addError}</p>}
          {addSuccess && <p className="success-message">{addSuccess}</p>}

          <div className="form-group"><label htmlFor="projectName">Name *</label><input type="text" name="projectName" value={formState.projectName} onChange={handleFormChange} required autoFocus /></div>
          <div className="form-group"><label htmlFor="description">Short Description</label><input type="text" name="description" value={formState.description} onChange={handleFormChange} /></div>
          
          <div className="form-group"><label htmlFor="icon-upload">Project Icon</label>
              <div style={{display: 'flex', alignItems: 'center', gap: '15px'}}>
                  {iconPreviewSrc && <Image src={iconPreviewSrc} alt="Icon Preview" width={40} height={40} unoptimized />}
                  <input type="file" id="icon-upload" name="icon" onChange={handleIconUpload} accept="image/*" />
              </div>
              {uploadError && <small className='error-message' style={{padding: '5px', marginTop: '5px'}}>{uploadError}</small>}
          </div>
          
          <div className="form-group"><label htmlFor="startCommand">Start Command *</label><input type="text" name="startCommand" value={formState.startCommand} onChange={handleFormChange} required /></div>
          <div className="form-group"><label htmlFor="stopCommand">Stop Command</label><input type="text" name="stopCommand" value={formState.stopCommand} onChange={handleFormChange} /></div>
          <div className="form-group"><label htmlFor="port">Port *</label><input type="number" name="port" value={formState.port} onChange={handleFormChange} required /></div>
          <div className="form-group"><label htmlFor="host">Host</label><input type="text" name="host" value={formState.host} onChange={handleFormChange} placeholder="e.g. localhost or blank" /></div>
          <div className="form-group"><label htmlFor="scheme">Scheme</label><select name="scheme" value={formState.scheme} onChange={handleFormChange}><option value="http">http</option><option value="https">https</option></select></div>
          
          {/* --- NEW INPUTS --- */}
          <div className="form-group"><label htmlFor="github_url">GitHub URL</label><input type="url" name="github_url" value={formState.github_url} onChange={handleFormChange} placeholder="https://github.com/..." /></div>
          <div className="form-group"><label htmlFor="deployed_url">Deployed URL</label><input type="url" name="deployed_url" value={formState.deployed_url} onChange={handleFormChange} placeholder="https://..." /></div>
          <div className="form-group"><label htmlFor="notes">Notes (Markdown supported)</label><textarea name="notes" value={formState.notes} onChange={handleFormChange} rows={5} /></div>
          {/* --- END NEW INPUTS --- */}
          
          <div className="form-group label-selector"><label htmlFor="labels">Assign Labels</label>{labelsLoading ? <p>Loading...</p> : <Select instanceId="add-project-label-select" inputId="labels" isMulti name="labels" options={getAllLabelOptions()} className="react-select-instance" classNamePrefix="react-select" value={selectedLabelOptions} onChange={(s) => setSelectedLabelOptions(s as any)} />}</div>
          <button type="submit" className="action-button add-button" disabled={isAddingProject || labelsLoading}>{isAddingProject ? 'Adding...' : 'Add Project'}</button>
        </form>
      </div>
    </div>
  );
}
