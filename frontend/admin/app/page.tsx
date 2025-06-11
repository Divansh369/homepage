"use client";

import Link from 'next/link';

export default function AdminIndexPage() {
    return (
        <div>
            <h2>Welcome to the Admin Panel</h2>
            <p>
                This is your central hub for managing the projects and labels displayed on the main dashboard.
            </p>
            <p>
                Use the navigation on the left to get started:
            </p>
            <ul>
                <li>
                    <Link href="/admin/projects" className="admin-table-link">Manage Projects</Link>
                    : View, create, edit, delete, and reorder all projects.
                </li>
                <li>
                    <Link href="/admin/labels" className="admin-table-link">Manage Labels</Link>
                    : View, create, edit, and delete all labels.
                </li>
            </ul>
        </div>
    );
}
