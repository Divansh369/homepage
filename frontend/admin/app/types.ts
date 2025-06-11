// frontend/admin/app/types.ts

export interface CardData {
    card_id: any;
    label_id: any;
    label_name: string;
}

export interface ProjectData {
    id: number;
    project_name: string;
    description: string;
    icon_filename: string;
    icon_path: string | null;
    start_command: string;
    stop_command: string;
    port: string;
    scheme: 'http' | 'https';
    host: string;
    cards: CardData[];
    // --- THE FIX ---
    order: number;
    // --- END FIX ---
    github_url: string | null;
    deployed_url: string | null;
    notes: string | null;
}

export interface Label {
    id: any;
    name: string;
    label_type: string;
}

export interface SelectOption {
    value: string;
    label: string;
}

export interface InitialStatusResult {
    name: string;
    running: boolean;
}
