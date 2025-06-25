// frontend/app/add-label/page.tsx
"use client";

import { useState, FormEvent, ChangeEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useTheme } from '../ThemeContext';

export default function AddLabelPage() {
    const { theme } = useTheme();
    const [newLabelName, setNewLabelName] = useState<string>('');
    const [newLabelType, setNewLabelType] = useState<'language' | 'utility' | ''>('');
    const [iconFile, setIconFile] = useState<File | null>(null);
    const [iconPreview, setIconPreview] = useState<string | null>(null);
    const [isAddingLabel, setIsAddingLabel] = useState<boolean>(false);
    const [addError, setAddError] = useState<string | null>(null);
    const [addSuccess, setAddSuccess] = useState<string | null>(null);

    const handleIconChange = (event: ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files[0]) {
            const file = event.target.files[0];
            setIconFile(file);
            setIconPreview(URL.createObjectURL(file));
        } else {
            setIconFile(null);
            setIconPreview(null);
        }
    };

    const handleAddLabel = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setAddError(null);
        setAddSuccess(null);
        if (!newLabelName.trim() || !newLabelType) {
            setAddError("Label Name and Type are required.");
            return;
        }
        setIsAddingLabel(true);

        const formData = new FormData();
        formData.append('name', newLabelName.trim());
        formData.append('type', newLabelType);
        if (iconFile) {
            formData.append('icon', iconFile);
        }

        try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/add-label`, {
                method: 'POST',
                body: formData, // No Content-Type header needed, browser sets it for FormData
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || `Failed to add label: ${response.status}`);
            }
            setAddSuccess(`Label "${newLabelName.trim()}" added successfully! ${result.icon ? `Icon: ${result.icon}` : ''}`);
            setNewLabelName('');
            setNewLabelType('');
            setIconFile(null);
            setIconPreview(null);
            // event.target.reset(); // Resets the form including file input
            const form = event.target as HTMLFormElement; // Cast to HTMLFormElement
            form.reset(); // This should clear the file input too

        } catch (err: any) {
            console.error("Error adding label:", err);
            setAddError(`Failed to add label: ${err.message}`);
        } finally {
            setIsAddingLabel(false);
        }
    };

    return (
        <div className={`page-container ${theme}`}>
             <div className="page-header">
                 <h1>Add New Label</h1>
                 <Link href="/" className="back-link">← Back to Dashboard</Link>
             </div>

            <div className="form-container">
                <form onSubmit={handleAddLabel} className="styled-form">
                    <h3>Create a Label</h3>
                    {addError && <p className="error-message">{addError}</p>}
                    {addSuccess && <p className="success-message">{addSuccess}</p>}

                    <div className="form-group">
                        <label htmlFor="new-label-name">Label Name:</label>
                        <input
                            type="text"
                            id="new-label-name"
                            value={newLabelName}
                            onChange={e => setNewLabelName(e.target.value)}
                            required
                            autoFocus
                        />
                         <small>This name will be used for the icon filename (e.g., Python {'->'} Python.png). Special characters will be replaced with underscores.</small>
                    </div>
                    <div className="form-group">
                        <label htmlFor="new-label-type">Label Type:</label>
                        <select
                            id="new-label-type"
                            value={newLabelType}
                            onChange={e => setNewLabelType(e.target.value as any)}
                            required
                        >
                            <option value="" disabled>Select Type</option>
                            <option value="language">Language</option>
                            <option value="utility">Utility</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label htmlFor="new-label-icon">Icon (PNG, max 1MB):</label>
                        <input
                            type="file"
                            id="new-label-icon"
                            accept="image/png"
                            onChange={handleIconChange}
                        />
                        {iconPreview && <Image src={iconPreview} alt="Icon preview" width={50} height={50} className="icon-preview" />}
                        <small>Recommended: Square, transparent PNG, 32x32 or 64x64.</small>
                    </div>

                    <button
                        type="submit"
                        className="action-button submit-button"
                        disabled={isAddingLabel}
                    >
                        {isAddingLabel ? 'Adding...' : 'Add Label'}
                    </button>
                </form>
            </div>
        </div>
    );
}
