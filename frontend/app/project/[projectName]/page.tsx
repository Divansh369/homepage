// frontend/app/project/[projectName]/page.tsx
"use client";

import React, { useState, useEffect, FormEvent, ChangeEvent, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation'; // For client components in App Router
import Link from 'next/link';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { MultiValue } from 'react-select';
import { useTheme } from '../../ThemeContext'; // Adjust path based on your ThemeContext location

interface LabelInfo { label_id: string; label_name: string; label_type: string; }
interface ProjectDetailsData {
  project_name: string;
  description: string;
  icon_filename: string; // Filename for icon in frontend/public/projects/PROJECT_NAME/
  icon_path: string; // Full path for display
  startup_script: string; // e.g., homepage/start.sh
  scheme: 'http' | 'https';
  port: string;
  host: string;
  labels: LabelInfo[];
  // Raw script content for editing
  start_script_content?: string;
  stop_script_content?: string;
}
interface FullLabel { id: string; name: string; label_type: string; }
interface SelectOption { value: string; label: string; }

const Select = dynamic(() => import('react-select'), {
  ssr: false,
  loading: () => <div className='navbar-control' style={{ minHeight: '38px', padding: '8px 10px', backgroundColor: '#eee', color: '#aaa' }}>Loading labels...</div>
});

const DEFAULT_PROJECT_HOST = process.env.NEXT_PUBLIC_FIXED_HOST || '100.94.150.11';

export default function ProjectDetailPage() {
  const { theme } = useTheme();
  const params = useParams();
  const router = useRouter();
  // Correctly handle potentially null params object before accessing projectName
  const projectNameFromRoute = params && typeof params.projectName === 'string' ? decodeURIComponent(params.projectName) : '';

  const [project, setProject] = useState<ProjectDetailsData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Editable fields state
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [currentIconFilename, setCurrentIconFilename] = useState(''); // Stores the existing icon filename for submission if no new icon
  const [newIconFile, setNewIconFile] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [editStartCommand, setEditStartCommand] = useState(''); // Content for start.sh
  const [editStopCommand, setEditStopCommand] = useState(''); // Content for stop.sh
  const [editScheme, setEditScheme] = useState<'http' | 'https'>('http');
  const [editPort, setEditPort] = useState('');
  const [editHost, setEditHost] = useState('');
  const [selectedLabelOptions, setSelectedLabelOptions] = useState<MultiValue<SelectOption>>([]);

  const [availableLabels, setAvailableLabels] = useState<FullLabel[]>([]);
  const [labelsLoading, setLabelsLoading] = useState<boolean>(true);

  // Fetch project details and labels
  useEffect(() => {
    if (!projectNameFromRoute) {
      setIsLoading(false);
      // No need to set error if params just aren't ready yet, page will show loading.
      // If it persists, then it's an actual issue.
      if (params) { // Only set error if params object exists but projectName is missing/invalid
        setError("Project name not found or invalid in URL.");
      }
      return;
    }

    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // Fetch Project Details
        const projectRes = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/project/${encodeURIComponent(projectNameFromRoute)}`);
        if (!projectRes.ok) throw new Error(`Project fetch failed: ${projectRes.status} ${await projectRes.text()}`);
        const projectData: ProjectDetailsData = await projectRes.json();
        setProject(projectData);
        // Initialize edit form fields
        setEditName(projectData.project_name);
        setEditDescription(projectData.description);
        setCurrentIconFilename(projectData.icon_filename); // Keep track of current icon
        setIconPreview(projectData.icon_path); // Show current icon
        setEditScheme(projectData.scheme);
        setEditPort(projectData.port);
        setEditHost(projectData.host || DEFAULT_PROJECT_HOST);
        setEditStartCommand(projectData.start_script_content || "# Current start script is homepage/start.sh\n# Enter new content to update it.");
        setEditStopCommand(projectData.stop_script_content || "# Current stop script is homepage/stop.sh\n# Enter new content to update it.");

        setLabelsLoading(true);
        const labelsRes = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/labels`);
        if (!labelsRes.ok) throw new Error(`Labels fetch failed: ${labelsRes.status}`);
        const labelsData: FullLabel[] = await labelsRes.json();
        setAvailableLabels(labelsData);
        const currentProjectLabels = projectData.labels.map(l => ({ value: l.label_id, label: `${l.label_name} (${l.label_type})`  }));
        setSelectedLabelOptions(currentProjectLabels);

      } catch (err: any) {
        setError(`Failed to load data: ${err.message}`);
        setProject(null);
      } finally {
        setIsLoading(false);
        setLabelsLoading(false);
      }
    };
    fetchData();
  }, [projectNameFromRoute, params]); // Added params to dependency array for the initial check

  const handleIconChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      setNewIconFile(file);
      setIconPreview(URL.createObjectURL(file));
    } else {
      setNewIconFile(null);
      setIconPreview(project?.icon_path || null);
    }
  };

  const handleLabelChange = (selectedOps: MultiValue<SelectOption>) => {
    setSelectedLabelOptions(selectedOps);
  };
  const getAllLabelOptions = (): SelectOption[] => availableLabels.map(l => ({ value: l.id, label: `${l.name} (${l.label_type})` }));

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!project) return;
    setError(null); setSuccess(null);

    if (!editName.trim() || !editPort.trim() || isNaN(parseInt(editPort))) {
      setError("Project Name and valid Port are required for update.");
      return;
    }

    const formData = new FormData();
    formData.append('projectName', editName.trim());
    formData.append('description', editDescription.trim());

    if (newIconFile) {
        formData.append('newIcon', newIconFile);
    } else {
        formData.append('iconFilename', currentIconFilename);
    }

    formData.append('startupScriptCommand', editStartCommand);
    formData.append('stopScriptCommand', editStopCommand);
    formData.append('scheme', editScheme);
    formData.append('port', editPort.trim());
    formData.append('host', editHost.trim() || DEFAULT_PROJECT_HOST);
    formData.append('selectedLabelsJson', JSON.stringify(selectedLabelOptions.map(opt => opt.value)));

    try {
      setIsLoading(true);
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/project/${encodeURIComponent(projectNameFromRoute)}`, {
        method: 'PUT',
        body: formData,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Update failed: ${response.status}`);

      setSuccess(`Project "${result.project.project_name}" updated successfully!`);
      setProject(result.project);
      setCurrentIconFilename(result.project.icon_filename);
      setNewIconFile(null); // Clear new file input state
      // If project name changed, update URL and internal route param if needed for subsequent fetches/effects
      if (projectNameFromRoute !== result.project.project_name) {
          router.replace(`/project/${encodeURIComponent(result.project.project_name)}`, { scroll: false });
          // Note: projectNameFromRoute won't update immediately from router.replace,
          // for immediate effect for *this component's state/logic* you might need to set it directly,
          // but useEffect dependency on actual params (from URL) is usually preferred.
          // This example relies on next useEffect run due to URL change.
      }


    } catch (err: any) {
      setError(`Update failed: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleMigrateScripts = async () => {
    if (!project || !editStartCommand.trim() || !editStopCommand.trim()) {
        setError("Please provide both Start and Stop commands content to migrate.");
        return;
    }
    setError(null); setSuccess(null);
    try {
        setIsLoading(true);
        const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/project/${encodeURIComponent(project.project_name)}/migrate-scripts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ startCommand: editStartCommand, stopCommand: editStopCommand }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `Migration failed: ${response.status}`);
        setSuccess(result.message);
        if (result.project) {
            setProject(prev => prev ? {...prev, startup_script: result.project.startup_script } : null);
        }

    } catch (err:any) {
        setError(`Script migration failed: ${err.message}`);
    } finally {
        setIsLoading(false);
    }
  };

  // Render logic based on states
  if (isLoading && !project && !error) return <div className={`page-container ${theme}`}><p className="loading-indicator">Loading project details...</p></div>;
  if (error && !project) return <div className={`page-container ${theme}`}><p className="error-message">{error}</p><Link href="/" className="back-link">← Go Home</Link></div>;
  if (!project && !isLoading) return <div className={`page-container ${theme}`}><p>Project not found or invalid URL.</p><Link href="/" className="back-link">← Go Home</Link></div>;
  // Fallback if project is somehow still null after loading finished and no error (should not happen if logic above is correct)
  if (!project) return null;


  return (
    <div className={`page-container ${theme}`}>
      <div className="page-header">
        <h1>Edit Project: {project.project_name}</h1>
        <Link href="/" className="back-link">← Back to Dashboard</Link>
      </div>

      <div className="form-container">
        <form onSubmit={handleSubmit} className="styled-form">
          <h3>Project Configuration</h3>
          {error && <p className="error-message">{error}</p>}
          {success && <p className="success-message">{success}</p>}

          <div className="form-group">
            <label htmlFor="edit-proj-name">Project Name:</label>
            <input type="text" id="edit-proj-name" value={editName} onChange={e => setEditName(e.target.value)} required />
          </div>
          <div className="form-group">
            <label htmlFor="edit-proj-desc">Description:</label>
            <textarea id="edit-proj-desc" value={editDescription} onChange={e => setEditDescription(e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="edit-proj-icon">Icon (PNG/SVG/JPG):</label>
            <input type="file" id="edit-proj-icon" accept="image/png, image/svg+xml, image/jpeg" onChange={handleIconChange} />
            <small>Current: {currentIconFilename || "None"}. Upload a new file to replace it.</small>
            {iconPreview && <Image src={iconPreview} alt="Icon preview" width={60} height={60} className="icon-preview" unoptimized={true} onError={() => setIconPreview('/label_icons/default.png')} />}
          </div>

          <div className="form-group">
            <label htmlFor="edit-proj-start-cmd">Start Command (content for `homepage/start.sh`):</label>
            <textarea id="edit-proj-start-cmd" value={editStartCommand} onChange={e => setEditStartCommand(e.target.value)} rows={4} />
          </div>
          <div className="form-group">
            <label htmlFor="edit-proj-stop-cmd">Stop Command (content for `homepage/stop.sh`):</label>
            <textarea id="edit-proj-stop-cmd" value={editStopCommand} onChange={e => setEditStopCommand(e.target.value)} rows={4} />
          </div>
           {project.startup_script !== "homepage/start.sh" && (
            <div className="form-group">
                <p style={{color: theme === 'dark' ? '#ffcc00' : '#c67800', fontSize: '0.9em', border: `1px solid ${theme === 'dark' ? '#ffcc00' : '#c67800'}`, padding: '10px', borderRadius: '4px'}}>
                    <strong>Legacy Script Detected:</strong> This project's <code>startup_script</code> is currently <code>{project.startup_script}</code>.
                    <br />
                    To use the new standard, fill in the Start/Stop command content fields above and click "Migrate".
                </p>
                <button type="button" onClick={handleMigrateScripts} className="action-button migrate-button" disabled={isLoading}>
                    Migrate to Standard Scripts
                </button>
                <small>This will create/overwrite <code>PROJECT_DIRECTORY/homepage/start.sh</code> and <code>PROJECT_DIRECTORY/homepage/stop.sh</code> and update the <code>startup_script</code> field in your CSV to `homepage/start.sh`.</small>
            </div>
          )}


          <div className="form-group"><label htmlFor="edit-proj-port">Port:</label><input type="number" id="edit-proj-port" value={editPort} onChange={e => setEditPort(e.target.value)} required /></div>
          <div className="form-group"><label htmlFor="edit-proj-scheme">Scheme:</label><select id="edit-proj-scheme" value={editScheme} onChange={e => setEditScheme(e.target.value as any)}><option value="http">http</option><option value="https">https</option></select></div>
          <div className="form-group"><label htmlFor="edit-proj-host">Host:</label><input type="text" id="edit-proj-host" value={editHost} onChange={e => setEditHost(e.target.value)} placeholder={DEFAULT_PROJECT_HOST} /></div>
          
          <div className="form-group">
            <label htmlFor="edit-proj-labels">Associated Labels:</label>
            {labelsLoading ? <p>Loading labels...</p> : (
              <Select
                instanceId={`edit-project-label-select-${projectNameFromRoute}`}
                inputId="edit-proj-labels"
                isMulti
                name="labels"
                options={getAllLabelOptions()}
                className="react-select-instance"
                classNamePrefix="react-select"
                value={selectedLabelOptions}
                onChange={handleLabelChange as any} // Cast to any to satisfy simplified Select import
                placeholder="Select labels..."
                isClearable={true}
                closeMenuOnSelect={false}
              />
            )}
          </div>
          <button type="submit" className="action-button submit-button" disabled={isLoading}>
            {isLoading ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>
    </div>
  );
}
