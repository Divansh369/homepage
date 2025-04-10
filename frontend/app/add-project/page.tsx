// frontend/app/add-project/page.tsx - Using React Select for Labels

"use client";

import { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic'; // Import dynamic
import type { MultiValue } from 'react-select'; // Import MultiValue type
import { useTheme } from '../ThemeContext'; // Adjust path if needed

// --- Dynamically import React Select ---
const Select = dynamic(() => import('react-select'), {
  ssr: false, // Disable SSR
  // Basic loading placeholder, adjust styling if needed
  loading: () => <div style={{ minHeight: '38px', padding: '8px 10px', border: '1px solid #ccc', borderRadius: '4px', backgroundColor: '#eee', color: '#aaa' }}>Loading labels...</div>
});


// --- Interfaces ---
interface Label {
    id: string; // label_name
    name: string;
    label_type: string;
}
// Type for React Select options
interface SelectOption {
    value: string; // Corresponds to Label['id'] (which is label_name)
    label: string; // Corresponds to Label['name'] + type for clarity
}


const FIXED_HOST_FOR_CUSTOM_PORT = process.env.NEXT_PUBLIC_FIXED_HOST || '100.114.43.102';

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
    const [newProjectIcon, setNewProjectIcon] = useState<string>('');
    const [newProjectScript, setNewProjectScript] = useState<string>('');
    const [newProjectScheme, setNewProjectScheme] = useState<'http' | 'https'>('http');
    const [newProjectPort, setNewProjectPort] = useState<string>('');
    const [newProjectHost, setNewProjectHost] = useState<string>(FIXED_HOST_FOR_CUSTOM_PORT);
    // --- State for React Select ---
    const [selectedLabelOptions, setSelectedLabelOptions] = useState<MultiValue<SelectOption>>([]);
    // REMOVED: const [selectedLabelsForNewProject, setSelectedLabelsForNewProject] = useState<Set<string>>(new Set());


    // Fetch labels needed for the dropdown on this page
    useEffect(() => {
        const fetchPageLabels = async () => {
            setLabelsLoading(true);
            setLabelsError(null);
            try {
                const labelsRes = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/labels`);
                if (!labelsRes.ok) throw new Error(`Labels fetch failed: ${labelsRes.status}`);
                const labelsData: Label[] = await labelsRes.json();
                if (!Array.isArray(labelsData)) throw new Error("Invalid label data format.");
                setAvailableLabels(labelsData);
                 if (labelsData.length > 0 && typeof labelsData[0].label_type === 'undefined') {
                    console.warn("Labels missing 'label_type'.");
                    setLabelsError("Label data is incomplete.");
                 }
            } catch (err: any) {
                console.error("Error fetching labels for add page:", err);
                setLabelsError(`Failed to load labels: ${err.message || 'Unknown error'}`);
                setAvailableLabels([]);
            } finally {
                setLabelsLoading(false);
            }
        };
        fetchPageLabels();
    }, []); // Run only on mount


    // --- Handler for adding the project ---
    const handleAddProject = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setAddError(null);
        setAddSuccess(null);
        if (!newProjectName.trim() || !newProjectScript.trim() || !newProjectPort.trim() || isNaN(parseInt(newProjectPort))) {
            setAddError("Project Name, Startup Script, and valid Port required.");
            return;
        }
        setIsAddingProject(true);

        // --- Extract selected label names (IDs) from React Select state ---
        const selectedLabelNames = selectedLabelOptions.map(option => option.value);

        const projectData = {
            projectName: newProjectName.trim(),
            description: newProjectDesc.trim(),
            iconFilename: newProjectIcon.trim(),
            startupScript: newProjectScript.trim(),
            scheme: newProjectScheme,
            port: newProjectPort.trim(),
            host: newProjectHost.trim() || FIXED_HOST_FOR_CUSTOM_PORT,
            selectedLabels: selectedLabelNames // Send array of names
        };
        try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/add-project`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(projectData),
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || `Failed to add project: ${response.status}`);
            }
            setAddSuccess(`Project "${projectData.projectName}" added successfully! Form cleared.`);
            // Clear form fields after successful submission
            setNewProjectName(''); setNewProjectDesc(''); setNewProjectIcon('');
            setNewProjectScript(''); setNewProjectScheme('http'); setNewProjectPort('');
            setNewProjectHost(FIXED_HOST_FOR_CUSTOM_PORT);
            setSelectedLabelOptions([]); // Clear React Select state
            // REMOVED: setSelectedLabelsForNewProject(new Set());
        } catch (err: any) {
            console.error("Error adding project:", err);
            setAddError(`Failed to add project: ${err.message}`);
        } finally {
            setIsAddingProject(false);
        }
    };

    // --- NEW: Handler for React Select component ---
    const handleReactSelectLabelChange = (selected: MultiValue<SelectOption>) => {
        setSelectedLabelOptions(selected);
    };
    // REMOVED: handleMultiLabelSelectionChange


    // --- Helper to format labels for React Select ---
     const getAllLabelOptions = (): SelectOption[] => {
        return availableLabels.map(l => ({
            value: l.id, // id is label_name
            label: `${l.name} (${l.label_type})` // Display name and type
        }));
     };


    return (
        <div className={`container ${theme}`}>
            <div className="page-header">
                <h1>Add New Project</h1>
                <Link href="/" className="back-link">← Back to Dashboard</Link>
            </div>

            <div className="add-form-container">
                <form onSubmit={handleAddProject} className="add-form">
                    {addError && <p className="error-message add-error">{addError}</p>}
                    {addSuccess && <p className="success-message add-success">{addSuccess}</p>}

                    {/* Form Groups */}
                    <div className="form-group"> <label htmlFor="new-proj-name">Name:</label> <input type="text" id="new-proj-name" value={newProjectName} onChange={e=>setNewProjectName(e.target.value)} required autoFocus/> </div>
                    <div className="form-group"> <label htmlFor="new-proj-desc">Description:</label> <input type="text" id="new-proj-desc" value={newProjectDesc} onChange={e=>setNewProjectDesc(e.target.value)} /> </div>
                    <div className="form-group"> <label htmlFor="new-proj-icon">Icon Filename:</label> <input type="text" id="new-proj-icon" value={newProjectIcon} onChange={e=>setNewProjectIcon(e.target.value)} placeholder="e.g., logo.png"/> </div>
                    <div className="form-group"> <label htmlFor="new-proj-script">Startup Script:</label> <input type="text" id="new-proj-script" value={newProjectScript} onChange={e=>setNewProjectScript(e.target.value)} required placeholder="e.g., start.sh" /> </div>
                    <div className="form-group"> <label htmlFor="new-proj-port">Port:</label> <input type="number" id="new-proj-port" value={newProjectPort} onChange={e=>setNewProjectPort(e.target.value)} required placeholder="e.g., 8000"/> </div>
                    <div className="form-group"> <label htmlFor="new-proj-scheme">Scheme:</label> <select id="new-proj-scheme" value={newProjectScheme} onChange={e=>setNewProjectScheme(e.target.value as any)}> <option value="http">http</option> <option value="https">https</option> </select> </div>
                    <div className="form-group"> <label htmlFor="new-proj-host">Host:</label> <input type="text" id="new-proj-host" value={newProjectHost} onChange={e=>setNewProjectHost(e.target.value)} placeholder={FIXED_HOST_FOR_CUSTOM_PORT} /> </div>

                    {/* --- REVISED: Label Selector using React Select --- */}
                    <div className="form-group label-selector">
                         <label htmlFor="new-proj-labels-rs">Assign Labels:</label>
                         {labelsLoading && <p>Loading labels...</p>}
                         {labelsError && <p className="error-message">{labelsError}</p>}
                         {!labelsLoading && !labelsError && (
                            <Select
                                instanceId="add-project-label-select" // Unique ID for this instance
                                inputId="new-proj-labels-rs" // Match label htmlFor
                                isMulti
                                name="labels"
                                options={getAllLabelOptions()} // Use helper to get options
                                className="react-select-instance" // For general styling
                                classNamePrefix="react-select" // For specific element styling
                                value={selectedLabelOptions} // Bind to react-select state
                                onChange={handleReactSelectLabelChange} // Use react-select handler
                                placeholder="Select labels..."
                                isClearable={true}
                                closeMenuOnSelect={false} // Good for multi-select
                            />
                         )}
                     </div>
                     {/* REMOVED old select and small hint */}

                    <button
                        type="submit"
                        className="action-button add-button"
                        disabled={isAddingProject || labelsLoading || !!labelsError}
                    >
                        {isAddingProject ? 'Adding...' : 'Add Project'}
                    </button>
                </form>
            </div>
        </div>
    );
}