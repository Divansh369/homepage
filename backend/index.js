require('dotenv').config({ path: '../.env' }); // Load environment variables
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec, execSync } = require('child_process');

const app = express();
const port = process.env.BACKEND_PORT || 3001;

const pool = new Pool({
    host: process.env.POSTGRES_HOST,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DATABASE,
    port: process.env.POSTGRES_PORT,
});

app.use(cors());
app.use(express.json());

console.log("🔧 Backend starting...");
console.log(`🌍 Running on http://100.114.43.102:${port}`);

app.get('/api/projects', async (req, res) => {
    console.log("📡 Received request: GET /api/projects");
    try {
        const projectsCsvPath = '/home/divansh/homepage/projects.csv';
        console.log(`📂 Reading projects from: ${projectsCsvPath}`);
        const projectsCsvData = fs.readFileSync(projectsCsvPath, 'utf8');
        const projectsData = parseCsv(projectsCsvData);
        console.log("📊 Parsed projects data:", projectsData);

        const cardQuery = `
            SELECT
                card.id AS card_id,
                card.name AS card_name,
                card.description AS card_description,
                card_label.label_id,
                label.name as label_name
            FROM card
            JOIN card_label ON card.id = card_label.card_id
            JOIN label ON card_label.label_id = label.id;
        `;
        console.log("🔍 Fetching cards from database...");
        const { rows: cardRows } = await pool.query(cardQuery);
        console.log("🃏 Retrieved cards:", cardRows);

        const combinedData = projectsData.map(project => {
            const matchingCards = cardRows.filter(card =>
                project.project_name.toLowerCase().includes(card.card_name.toLowerCase())
            );
            return {
                ...project,
                cards: matchingCards,
            };
        });
        console.log("🔗 Combined project and card data:", combinedData);

        res.json(combinedData);
    } catch (error) {
        console.error('❌ Error fetching projects:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/api/labels', async (req, res) => {
    console.log("📡 Received request: GET /api/labels");
    try {
        const labelQuery = "SELECT id, name FROM label;";
        console.log("🔍 Fetching labels from database...");
        const { rows: labelRows } = await pool.query(labelQuery);
        console.log("🏷️ Retrieved labels:", labelRows);
        res.json(labelRows);
    } catch (error) {
        console.error('❌ Error fetching labels:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

function parseCsv(csvData) {
    console.log("📑 Parsing CSV data...");
    const lines = csvData.trim().split('\n');
    const headers = lines[0].split(',').map(header => header.trim());
    const data = [];

    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(value => value.trim());
        const entry = {};
        for (let j = 0; j < headers.length; j++) {
            entry[headers[j]] = values[j];
        }
        data.push(entry);
    }
    console.log("✅ Parsed CSV data:", data);
    return data;
}

function pruneInactiveProcesses() {
    try {
        console.log("🧹 Pruning inactive processes...");
        const threshold = 300; // 5 minutes (300 seconds)
        const now = Math.floor(Date.now() / 1000);

        const processes = execSync("ps -eo pid,etimes,command").toString().split("\n");
        console.log("🔍 Scanning process list...");

        processes.forEach(line => {
            const parts = line.trim().split(/\s+/);
            if (parts.length < 3) return;

            const pid = parts[0];
            const elapsedTime = parseInt(parts[1], 10);
            const command = parts.slice(2).join(" ");

            if (elapsedTime > threshold && command.includes('/home/divansh/projects/')) {
                console.log(`🗑️ Killing process ${pid} (inactive for ${elapsedTime} seconds)`);
                execSync(`kill -9 ${pid}`);
            }
        });
    } catch (error) {
        console.error("❌ Error pruning inactive processes:", error.message);
    }
}

app.post('/api/start-project', async (req, res) => {
    console.log("📡 Received request: POST /api/start-project", req.body);
    const { projectName } = req.body;

    if (!projectName) {
        console.warn("⚠️ Project name missing in request");
        return res.status(400).json({ error: 'Project name is required.' });
    }

    try {
        console.log("📂 Reading projects CSV to find startup script...");
        const projectsCsvPath = '/home/divansh/homepage/projects.csv';
        const projectsCsvData = fs.readFileSync(projectsCsvPath, 'utf8');
        const projectsData = parseCsv(projectsCsvData);
        const project = projectsData.find(p => p.project_name === projectName);

        if (!project) {
            console.error("❌ Project not found in CSV:", projectName);
            return res.status(404).json({ error: 'Project not found.' });
        }

        const startupScriptPath = path.join('/home/divansh/projects', project.project_name, project.startup_script);
        console.log(`🚀 Starting project: ${projectName} with script: ${startupScriptPath}`);

        // Spawn the process
        const child = exec(startupScriptPath, { cwd: path.dirname(startupScriptPath) });

        // Capture stdout
        child.stdout.on('data', (data) => {
            console.log(`📜 [${projectName}] stdout: ${data.toString().trim()}`);
        });

        // Capture stderr
        child.stderr.on('data', (data) => {
            console.error(`⚠️ [${projectName}] stderr: ${data.toString().trim()}`);
        });

        // Handle process exit
        child.on('exit', (code) => {
            console.log(`✅ [${projectName}] Process exited with code ${code}`);
        });

        res.json({ message: 'Project started successfully!', port: project.port });
    } catch (error) {
        console.error('❌ Error starting project:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.listen(port, '100.114.43.102', () => {
    console.log(`🚀 Backend server listening on port ${port} at http://100.114.43.102:${port}`);
});
