"use client";

import React, { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { MultiValue, ActionMeta } from 'react-select';
import { useTheme } from '../ThemeContext';

interface Label { id: string; name: string; label_type: string; }
interface SelectOption { value: string; label: string; }

const Select = dynamic(() => import('react-select'), {
  ssr: false,
  loading: () => <div className='navbar-control' style={{ minHeight: '38px', padding: '8px 10px', backgroundColor: '#eee', color: '#aaa' }}>Loading labels...</div>
});

const DEFAULT_PROJECT_HOST = process.env.NEXT_PUBLIC_FIXED_HOST || '100.94.150.11'; // Match what backend might use as default

export default function AddProjectPage() {
  const { theme } = useTheme();
  const [availableLabels, setAvailableLabels] = useState<Label[]>([]);
  const [labelsLoading, setLabelsLoading] = useState<boolean>(true);
  const [labelsError, setLabelsError] = useState<string | null>(null);
  const [isAddingProject, setIsAddingProject] = useState<boolean>(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);

  // Form state
  const [newProjectName, setNewProjectName] = useState<string>('');
  const [newProjectDesc, setNewProjectDesc] = useState<string>('');
  const [projectIconFile, setProjectIconFile] = useState<File | null>(null);
  const [projectIconPreview, setProjectIconPreview] = useState<string | null>(null);
  // No longer just iconFilename text input if we're uploading
  const [startCommand, setStartCommand] = useState<string>('');
  const [stopCommand, setStopCommand] = useState<string>('');
  const [newProjectScheme, setNewProjectScheme] = useState<'http' | 'https'>('http');
  const [newProjectPort, setNewProjectPort] = useState<string>('');
  const [newProjectHost, setNewProjectHost] = useState<string>(DEFAULT_PROJECT_HOST);
  const [selectedLabelOptions, setSelectedLabelOptions] = useState<MultiValue<SelectOption>>([]);

  useEffect(() => {
    const fetchPageLabels = async () => {
      setLabelsLoading(true); setLabelsError(null);
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/labels`);
        if (!res.ok) throw new Error(`Labels fetch failed: ${res.status}`);
        const data: Label[] = await res.json();
        if (!Array.isArray(data)) throw new Error("Invalid label data format.");
        setAvailableLabels(data);
      } catch (err: any) { setLabelsError(`Failed to load labels: ${err.message || 'Unknown error'}`); }
      finally { setLabelsLoading(false); }
    };
    fetchPageLabels();
  }, []);

  const handleProjectIconChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      setProjectIconFile(file);
      setProjectIconPreview(URL.createObjectURL(file));
    } else {
      setProjectIconFile(null);
      setProjectIconPreview(null);
    }
  };

  const handleReactSelectLabelChange = (newValue: unknown) => {
    setSelectedLabelOptions(newValue as MultiValue<SelectOption>);
  };
  const getAllLabelOptions = (): SelectOption[] => availableLabels.map(l => ({ value: l.id, label: `${l.name} (${l.label_type})` }));

  const handleAddProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAddError(null); setAddSuccess(null);

    if (!newProjectName.trim() || !newProjectPort.trim() || isNaN(parseInt(newProjectPort))) {
      setAddError("Project Name and valid Port are required.");
      return;
    }
    // startCommand & stopCommand are optional, backend will use defaults if empty

    setIsAddingProject(true);
    const formData = new FormData();
    formData.append('projectName', newProjectName.trim());
    formData.append('description', newProjectDesc.trim());
    if (projectIconFile) formData.append('icon', projectIconFile);
    // The actual startup script will be homepage/start.sh, these are just commands for content
    formData.append('startupScriptCommand', startCommand);
    formData.append('stopScriptCommand', stopCommand);
    formData.append('scheme', newProjectScheme);
    formData.append('port', newProjectPort.trim());
    formData.append('host', newProjectHost.trim() || DEFAULT_PROJECT_HOST);
    formData.append('selectedLabelsJson', JSON.stringify(selectedLabelOptions.map(opt => opt.value)));


    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/add-project`, {
        method: 'POST', body: formData,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Failed to add project: ${response.status}`);

      setAddSuccess(`Project "${result.project.project_name}" added! Icon: ${result.project.icon_filename || 'none'}. Scripts created.`);
      // Reset form
      setNewProjectName(''); setNewProjectDesc(''); setProjectIconFile(null); setProjectIconPreview(null);
      setStartCommand(''); setStopCommand(''); setNewProjectScheme('http'); setNewProjectPort('');
      setNewProjectHost(DEFAULT_PROJECT_HOST); setSelectedLabelOptions([]);
      (event.target as HTMLFormElement).reset(); // Clear file input
    } catch (err: any) { setAddError(`Add project failed: ${err.message}`); }
    finally { setIsAddingProject(false); }
  };

  return (
    <div className={`page-container ${theme}`}>
      <div className="page-header">
        <h1>Add New Project</h1>
        <Link href="/" className="back-link">← Back to Dashboard</Link>
      </div>
      <div className="form-container">
        <form onSubmit={handleAddProject} className="styled-form">
          <h3>Create a Project</h3>
          {addError && <p className="error-message">{addError}</p>}
          {addSuccess && <p className="success-message">{addSuccess}</p>}

          <div className="form-group"><label htmlFor="new-proj-name">Name:</label><input type="text" id="new-proj-name" value={newProjectName} onChange={e => setNewProjectName(e.target.value)} required autoFocus /></div>
          <div className="form-group"><label htmlFor="new-proj-desc">Description:</label><textarea id="new-proj-desc" value={newProjectDesc} onChange={e => setNewProjectDesc(e.target.value)} /></div>
          <div className="form-group"><label htmlFor="new-proj-icon">Icon (PNG/SVG/JPG, max 1MB):</label><input type="file" id="new-proj-icon" accept="image/png, image/svg+xml, image/jpeg" onChange={handleProjectIconChange} /><small>If provided, will be saved as `frontend/public/projects/PROJECT_NAME/filename.ext`.</small>{projectIconPreview && <Image src={projectIconPreview} alt="Project icon preview" width={60} height={60} className="icon-preview" />}</div>
          <div className="form-group"><label htmlFor="new-proj-start-cmd">Start Command (content for start.sh):</label><textarea id="new-proj-start-cmd" value={startCommand} onChange={e => setStartCommand(e.target.value)} placeholder="e.g., cd /app && npm start" rows={3}></textarea><small>This will be put into `PROJECT_PATH/homepage/start.sh`.</small></div>
          <div className="form-group"><label htmlFor="new-proj-stop-cmd">Stop Command (content for stop.sh):</label><textarea id="new-proj-stop-cmd" value={stopCommand} onChange={e => setStopCommand(e.target.value)} placeholder="e.g., pkill -f my-app-process or kill $(cat app.pid)" rows={3}></textarea><small>This will be put into `PROJECT_PATH/homepage/stop.sh`.</small></div>
          <div className="form-group"><label htmlFor="new-proj-port">Port:</label><input type="number" id="new-proj-port" value={newProjectPort} onChange={e => setNewProjectPort(e.target.value)} required placeholder="e.g., 8000" /></div>
          <div className="form-group"><label htmlFor="new-proj-scheme">Scheme:</label><select id="new-proj-scheme" value={newProjectScheme} onChange={e => setNewProjectScheme(e.target.value as any)}><option value="http">http</option><option value="https">https</option></select></div>
          <div className="form-group"><label htmlFor="new-proj-host">Host (IP or DNS):</label><input type="text" id="new-proj-host" value={newProjectHost} onChange={e => setNewProjectHost(e.target.value)} placeholder={DEFAULT_PROJECT_HOST} /><small>Default: {DEFAULT_PROJECT_HOST}. Leave blank to use default.</small></div>

          <div className="form-group">
            <label htmlFor="new-proj-labels-rs">Assign Labels:</label>
            {labelsLoading && <p>Loading labels...</p>} {labelsError && <p className="error-message">{labelsError}</p>}
            {!labelsLoading && !labelsError && (
              <Select instanceId="add-project-label-select" inputId="new-proj-labels-rs" isMulti name="labels" options={getAllLabelOptions()} className="react-select-instance" classNamePrefix="react-select" value={selectedLabelOptions} onChange={handleReactSelectLabelChange} placeholder="Select labels..." isClearable={true} closeMenuOnSelect={false} />
            )}
          </div>
          <button type="submit" className="action-button submit-button" disabled={isAddingProject || labelsLoading}>
            {isAddingProject ? 'Adding...' : 'Add Project'}
          </button>
        </form>
      </div>
    </div>
  );
}
