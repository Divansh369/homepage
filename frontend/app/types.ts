// frontend/app/types.ts

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
    icon_path: string;
    start_command: string;
    stop_command: string;
    port: string;
    scheme: 'http' | 'https';
    host: string;
    cards: CardData[];
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
