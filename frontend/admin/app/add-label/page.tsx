// frontend/app/add-label/page.tsx
"use client";

import { useState, FormEvent } from 'react';
import Link from 'next/link'; // Import Link for navigation
import { useTheme } from '../ThemeContext'; // Adjust path if needed

export default function AddLabelPage() {
    const { theme } = useTheme();
    const [newLabelName, setNewLabelName] = useState<string>('');
    const [newLabelType, setNewLabelType] = useState<'language' | 'utility' | ''>('');
    const [isAddingLabel, setIsAddingLabel] = useState<boolean>(false);
    const [addError, setAddError] = useState<string | null>(null);
    const [addSuccess, setAddSuccess] = useState<string | null>(null);

    const handleAddLabel = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setAddError(null);
        setAddSuccess(null);
        if (!newLabelName.trim() || !newLabelType) {
            setAddError("Label Name and Type are required.");
            return;
        }
        setIsAddingLabel(true);
        try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/add-label`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newLabelName.trim(), type: newLabelType }),
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || `Failed to add label: ${response.status}`);
            }
            setAddSuccess(`Label "${newLabelName.trim()}" added successfully!`);
            setNewLabelName(''); // Clear form on success
            setNewLabelType('');
            // Optionally redirect back after a delay or keep message on page
            // setTimeout(() => router.push('/'), 2000); // Needs Next.js router
        } catch (err: any) {
            console.error("Error adding label:", err);
            setAddError(`Failed to add label: ${err.message}`);
        } finally {
            setIsAddingLabel(false);
        }
    };

    return (
        <div className={`container ${theme}`}>
             {/* Simple Navbar or Header for context */}
             <div className="page-header">
                 <h1>Add New Label</h1>
                 <Link href="/" className="back-link">← Back to Dashboard</Link>
             </div>

             {/* Add Label Form - Using existing CSS classes */}
            <div className="add-form-container"> {/* Wrap form for centering/styling */}
                <form onSubmit={handleAddLabel} className="add-form">
                    {addError && <p className="error-message add-error">{addError}</p>}
                    {addSuccess && <p className="success-message add-success">{addSuccess}</p>}

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
                            {/* Add other types if needed */}
                        </select>
                    </div>
                    <button
                        type="submit"
                        className="action-button add-button" // Reusing button style
                        disabled={isAddingLabel}
                    >
                        {isAddingLabel ? 'Adding...' : 'Add Label'}
                    </button>
                </form>
            </div>
        </div>
    );
}
