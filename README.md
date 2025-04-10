# 🚀 Homepage Dashboard

A personal project dashboard built with Next.js (React/TypeScript) and a Node.js/Express backend. It displays projects defined in local CSV files and allows launching them directly from the interface.

![image](https://github.com/user-attachments/assets/46b909e0-993a-4a47-86fa-37afba761ba8)


---

## ✨ Features

*   **Project Showcase:** Displays projects listed in `projects.csv`.
*   **Dynamic Data:** Fetches project and label data from a simple Node.js backend API that reads local CSVs.
*   **Label Filtering:** Filter displayed projects based on labels defined in `labels.csv` and `project_labels.csv`.
*   **Remote Project Launch:** Start associated project scripts (defined in `projects.csv`) via a backend API call.
*   **Icon Display:** Shows project-specific icons and associated technology/label icons.
*   **Custom Port Navigation:** Quickly navigate to any specified port on the host machine.
*   **Theme Toggle:** Switch between light and dark modes (persisted in `localStorage`).
*   **Responsive Design:** Basic styling for different screen sizes.

---

## 🛠️ Tech Stack

*   **Frontend:** Next.js (v15+), React (v19+), TypeScript, Tailwind CSS
*   **Backend:** Node.js, Express.js, cors, dotenv
*   **Data Source:** Local CSV Files
*   **Development:** concurrently

---

## 🔧 Prerequisites

*   [Node.js](https://nodejs.org/) (LTS version recommended)
*   [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/) or [pnpm](https://pnpm.io/)
*   Access to the file system paths where the CSV files and project startup scripts are located (see Configuration).

---

## ⚙️ Setup & Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/Divansh369/homepage.git
    cd homepage
    ```

2.  **Install All Dependencies:** Run `npm install` (or equivalent) in the **root**, `backend`, and `frontend` directories.
    ```bash
    npm install
    cd backend && npm install && cd ..
    cd frontend && npm install && cd ..
    ```

---

## 📄 Data Configuration (CSV Files)

The backend relies heavily on three CSV files located in the `backend/` directory. **Ensure these files exist and are correctly formatted.**

1.  **`backend/projects.csv`**: Defines the projects to display.
    *   **Columns Required:**
        *   `project_name`: Unique identifier for the project (used internally and potentially in URLs).
        *   `description`: A short description displayed on the card.
        *   `icon_filename`: The filename of the project's icon (e.g., `logo.svg`, `myproject.png`). This file should be placed in `frontend/public/projects/<project_name>/`.
        *   `startup_script`: The relative path *from the project's root directory* (e.g., `/home/username/projects/<project_name>`) to the script that starts the project (e.g., `start.sh`, `bin/startup.sh`). The backend executes this script.
        *   `port`: The port number the project runs on after being started. Used for the "Start" button link.
    *   **Example Row:**
        ```csv
        jupyter,"Jupyter Interactive Notebook",jupyter.svg,start_jupyter.sh,9742
        ```

2.  **`backend/labels.csv`**: Defines the available technology/category labels.
    *   **Columns Required:**
        *   `label_name`: The name of the label (e.g., `Python`, `Go`, `Docker`). This name **must** match the corresponding icon filename (case-sensitive) in `frontend/public/label_icons/` (e.g., `Python.png`).
    *   **Example Rows:**
        ```csv
        label_name
        Python
        Javascript
        Docker
        ```

3.  **`backend/project_labels.csv`**: Links projects to labels (Many-to-Many).
    *   **Columns Required:**
        *   `project_name`: Must match a `project_name` in `projects.csv`.
        *   `label_name`: Must match a `label_name` in `labels.csv`.
    *   **Example Rows:**
        ```csv
        project_name,label_name
        jupyter,Python
        gitea,Go
        superset,Python
        superset,Apache
        ```

**Important:**

*   The backend script (`backend/index.js`) currently uses **hardcoded absolute paths** to read these CSV files. **You must update these paths** (`PROJECTS_CSV`, `LABELS_CSV`, `PROJECT_LABELS_CSV` constants) to reflect their actual location on your server machine.
*   CSV parsing in the backend is basic and assumes commas are the delimiter and handles simple double quotes. Complex CSVs with escaped commas within fields might require a more robust parsing library.

---

## ⚙️ Other Configuration

1.  **Backend Script Paths:** Verify the hardcoded path to the base directory containing your actual project folders (`/home/username/projects`) in `backend/index.js` used for executing `startup_script`.

2.  **Icons:**
    *   **Label Icons:** Place `.png` icons named *exactly* like your `label_name` values (case-sensitive) inside `frontend/public/label_icons/`.
    *   **Project Icons:** Place each project's icon file (named according to `icon_filename` in `projects.csv`) inside `frontend/public/projects/<project_name>/`. You need to create the `<project_name>` subdirectories manually.

3.  **Environment Variables (`.env`):**
    *   Create a `.env` file in the **root** project directory (`homepage/.env`).
    *   Define `BACKEND_PORT` (e.g., `3001`) for the Node.js server and `NEXT_PUBLIC_BACKEND_URL` (e.g., `http://localhost:3001` or `http://<your-backend-ip>:3001`) for the frontend to connect to the backend API.

        ```env
        # .env
        BACKEND_PORT=3001
        NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
        ```

---

## ▶️ Running the Project

1.  Navigate to the root directory (`homepage`).
2.  Run the start script:

    ```bash
    npm start
    ```

3.  This starts both the backend (default: port 3001) and frontend (default: port 1025).
4.  Open your browser to the **frontend URL** (e.g., `http://localhost:1025`).

---

## 🤝 Contributing

This is a personal project, but feel free to fork and adapt it for your own use!

---

## 📄 License

*(Specify your license here, e.g., MIT License, or state that it's private)*

