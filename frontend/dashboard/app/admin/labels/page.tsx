"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link'; // <<< FIX: Added the missing import
import { useProjectStore } from '../../../store/projectStore';
import { shallow } from 'zustand/shallow';
import { Label } from '../../types';

export default function AdminLabelsPage() {
    const {
        availableLabels,
        isLoading,
        error,
        fetchInitialData,
    } = useProjectStore(state => ({
        availableLabels: state.availableLabels,
        isLoading: state.isLoading,
        error: state.error,
        fetchInitialData: state.fetchInitialData,
    }), shallow);
    
    // Local state to manage which row is being edited
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editFormData, setEditFormData] = useState({ name: '', type: 'language' as 'language' | 'utility' });

    useEffect(() => {
        // Only fetch if the store hasn't been populated yet
        if (availableLabels.length === 0) {
            fetchInitialData();
        }
    }, [availableLabels.length, fetchInitialData]);

    const handleEditClick = (label: Label) => {
        setEditingId(label.id);
        setEditFormData({ name: label.name, type: label.label_type as 'language' | 'utility' });
    };

    const handleCancelClick = () => {
        setEditingId(null);
    };

    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setEditFormData(prev => ({ ...prev, [name]: value as any }));
    };

    const handleSaveClick = async (id: number) => {
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/labels/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editFormData),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || "Failed to update label");
            
            await fetchInitialData(); 
            setEditingId(null);
        } catch (err: any) {
            alert(`Failed to save label: ${err.message}`);
        }
    };

    const handleDeleteClick = async (id: number, name: string) => {
        if (!window.confirm(`Are you sure you want to delete the label "${name}"? This will remove it from all projects.`)) return;

        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/labels/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error((await res.json()).error || "Failed to delete label");
            await fetchInitialData();
        } catch (err: any) {
             alert(`Failed to delete label: ${err.message}`);
        }
    };

    return (
        <div>
            <div className="admin-page-header">
                <h2>Manage Labels</h2>
                <Link href="/add-label" className="action-button nav-add-button">
                    + Add New Label
                </Link>
            </div>

            {isLoading && <p>Loading labels...</p>}
            {error && <p className="error-message">{error}</p>}

            {!isLoading && (
                <div className="admin-table-container">
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Name</th>
                                <th>Type</th>
                                <th style={{width: '200px'}}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {availableLabels.map(label => {
                                const isEditing = editingId === label.id;
                                return (
                                    <tr key={label.id}>
                                        <td>{label.id}</td>
                                        <td>
                                            {isEditing ? (
                                                <input
                                                    type="text"
                                                    name="name"
                                                    className="inline-edit-input"
                                                    value={editFormData.name}
                                                    onChange={handleFormChange}
                                                />
                                            ) : (
                                                label.name
                                            )}
                                        </td>
                                        <td>
                                            {isEditing ? (
                                                <select name="type" className="inline-edit-input" value={editFormData.type} onChange={handleFormChange}>
                                                    <option value="language">language</option>
                                                    <option value="utility">utility</option>
                                                </select>
                                            ) : (
                                                label.label_type
                                            )}
                                        </td>
                                        <td>
                                            <div className="action-cell">
                                                {isEditing ? (
                                                    <>
                                                        <button onClick={() => handleSaveClick(label.id)} className="action-button-table save">Save</button>
                                                        <button onClick={handleCancelClick} className="action-button-table cancel">Cancel</button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button onClick={() => handleEditClick(label)} className="action-button-table edit">Edit</button>
                                                        <button onClick={() => handleDeleteClick(label.id, label.name)} className="action-button-table delete">Delete</button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
            {!isLoading && availableLabels.length === 0 && <p>No labels found.</p>}
        </div>
    );
}
