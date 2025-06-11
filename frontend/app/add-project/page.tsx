"use client";

import { useState, useEffect, FormEvent, useCallback } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { MultiValue, ActionMeta } from 'react-select';
import { useTheme } from '../ThemeContext';
import Image from 'next/image';
import { Label, SelectOption } from '../types';

const Select = dynamic(() => import('react-select'), {
  ssr: false,
  loading: () => <div style={{minHeight: '38px', padding: '8px 10px', border: '1px solid #ccc', borderRadius: '4px', backgroundColor: '#eee', color: '#aaa'}}>Loading...</div>
});

const FIXED_HOST_FOR_CUSTOM_PORT = process.env.NEXT_PUBLIC_FIXED_HOST || '';
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || '';

export default function AddProjectPage() {
  const { theme } = useTheme();
  const [availableLabels, setAvailableLabels] = useState<Label[]>([]);
  const [labelsLoading, setLabelsLoading] = useState<boolean>(true);
  const [labelsError, setLabelsError] = useState<string | null>(null);
  const [isAddingProject, setIsAddingProject] = useState<boolean>(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [formState, setFormState] = useState({
    projectName: '',
    description: '',
    iconFilename: '', // Will hold the uploaded path
    startCommand: '',
    stopCommand: '',
    scheme: 'http',
    port: '',
    host: FIXED_HOST_FOR_CUSTOM_PORT
  });
  const [selectedLabelOptions, setSelectedLabelOptions] = useState<MultiValue<SelectOption>>([]);

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormState(prevState => ({ ...prevState, [name]: value }));
  };

  const clearForm = () => {
    setFormState({
        projectName: '', description: '', iconFilename: '', startCommand: '', stopCommand: '', scheme: 'http', port: '', host: FIXED_HOST_FOR_CUSTOM_PORT
    });
    setSelectedLabelOptions([]);
  };

  useEffect(() => {
    const fetchPageLabels = async () => { /* ... no change ... */
      setLabelsLoading(true); setLabelsError(null);
      try {
        const res = await fetch(`${BACKEND_URL}/api/labels`);
        if (!res.ok) throw new Error(`Labels fetch failed: ${res.status}`);
        const data: Label[] = await res.json();
        setAvailableLabels(data);
      } catch (err: any) { setLabelsError(err.message); }
      finally { setLabelsLoading(false); }
    };
    fetchPageLabels();
  }, []);

  const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setUploadError(null);
      const formData = new FormData();
      formData.append('icon', file);
      try {
          const res = await fetch(`${BACKEND_URL}/api/upload/icon`, { method: 'POST', body: formData });
          const result = await res.json();
          if (!res.ok) throw new Error(result.error || "Upload failed");
          setFormState(prevState => ({ ...prevState, iconFilename: result.filePath }));
      } catch (err: any) {
          console.error("Upload error:", err);
          setUploadError(err.message);
      }
  };

  const handleReactSelectLabelChange = (newValue: unknown) => { setSelectedLabelOptions(newValue as MultiValue<SelectOption>); };
  const getAllLabelOptions = useCallback((): SelectOption[] => availableLabels.map(l => ({ value: String(l.id), label: `${l.name} (${l.label_type})`})), [availableLabels]);

  const handleAddProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAddError(null);
    setAddSuccess(null);
    if (!formState.projectName || !formState.startCommand || !formState.port) {
      setAddError("Project Name, Start Command, and a valid Port are required.");
      return;
    }
    setIsAddingProject(true);
    const payload = {
      ...formState,
      selectedLabels: selectedLabelOptions.map(opt => parseInt(opt.value))
    };
    try {
      const response = await fetch(`${BACKEND_URL}/api/add-project`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to add project');
      setAddSuccess(`Project "${payload.projectName}" added successfully!`);
      clearForm();
    } catch (err: any) { setAddError(`Failed to add project: ${err.message}`); }
    finally { setIsAddingProject(false); }
  };
  
  const iconPreviewSrc = formState.iconFilename ? `${BACKEND_URL}${formState.iconFilename}` : null;

  return (
    <div className={`container ${theme}`}>
      <div className="page-header"><h1>Add New Project</h1><Link href="/" className="back-link">← Back to Dashboard</Link></div>
      <div className="add-form-container">
        <form onSubmit={handleAddProject} className="add-form">
          {addError && <p className="error-message">{addError}</p>}
          {addSuccess && <p className="success-message">{addSuccess}</p>}

          <div className="form-group">
              <label htmlFor="icon-upload">Project Icon</label>
              <div style={{display: 'flex', alignItems: 'center', gap: '15px'}}>
                  {iconPreviewSrc && <Image src={iconPreviewSrc} alt="Icon Preview" width={40} height={40} style={{borderRadius: '5px'}} unoptimized/>}
                  <input type="file" id="icon-upload" name="icon" onChange={handleIconUpload} accept="image/*" />
              </div>
              {uploadError && <small style={{color: 'var(--color-error-text)', marginTop: '5px'}}>{uploadError}</small>}
              <small>Upload an icon (optional). It will populate the read-only path field below.</small>
          </div>
          
          <div className="form-group"><label htmlFor="iconFilename">Icon Path (read-only):</label><input type="text" name="iconFilename" value={formState.iconFilename} readOnly/></div>
          <div className="form-group"><label htmlFor="projectName">Name:</label><input type="text" name="projectName" value={formState.projectName} onChange={handleFormChange} required autoFocus /></div>
          <div className="form-group"><label htmlFor="description">Description:</label><input type="text" name="description" value={formState.description} onChange={handleFormChange} /></div>
          <div className="form-group"><label htmlFor="startCommand">Start Command:</label><input type="text" name="startCommand" value={formState.startCommand} onChange={handleFormChange} required placeholder="e.g., npm run start" /></div>
          <div className="form-group"><label htmlFor="stopCommand">Stop Command:</label><input type="text" name="stopCommand" value={formState.stopCommand} onChange={handleFormChange} placeholder="e.g., kill-port 8000" /></div>
          <div className="form-group"><label htmlFor="port">Port:</label><input type="number" name="port" value={formState.port} onChange={handleFormChange} required placeholder="e.g., 8000" /></div>
          <div className="form-group"><label htmlFor="scheme">Scheme:</label><select name="scheme" value={formState.scheme} onChange={handleFormChange}><option value="http">http</option><option value="httpss">https</option></select></div>
          <div className="form-group"><label htmlFor="host">Host:</label><input type="text" name="host" value={formState.host} onChange={handleFormChange} placeholder={FIXED_HOST_FOR_CUSTOM_PORT || 'e.g., localhost'} /></div>

          <div className="form-group label-selector"><label htmlFor="labels">Assign Labels:</label>{labelsLoading ? <p>Loading...</p> : labelsError ? <p className="error-message">{labelsError}</p> : <Select instanceId="add-project-label-select" inputId="labels" isMulti name="labels" options={getAllLabelOptions()} className="react-select-instance" classNamePrefix="react-select" value={selectedLabelOptions} onChange={handleReactSelectLabelChange}/>}</div>
          <button type="submit" className="action-button add-button" disabled={isAddingProject || labelsLoading}>{isAddingProject ? 'Adding...' : 'Add Project'}</button>
        </form>
      </div>
    </div>
  );
}
