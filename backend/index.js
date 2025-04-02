require('dotenv').config({ path: '../.env' });
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec, execSync } = require('child_process');

const app = express();
const port = process.env.BACKEND_PORT || 3001;

app.use(cors());
app.use(express.json());

console.log("\ud83d\udd27 Backend starting...");
console.log(`\ud83c\udf0d Running on http://100.114.43.102:${port}`);

const PROJECTS_CSV = '/home/divansh/homepage/backend/projects.csv';
const LABELS_CSV = '/home/divansh/homepage/backend/labels.csv';
const PROJECT_LABELS_CSV = '/home/divansh/homepage/backend/project_labels.csv';

function parseCsv(filePath) {
    console.log(`\ud83d\udcda Parsing CSV: ${filePath}`);
    const data = fs.readFileSync(filePath, 'utf8');
    const lines = data.trim().split('\n');
    const headers = lines[0].split(',').map(header => header.trim());
    return lines.slice(1).map(line => {
        const values = [];
        let inQuotes = false;
        let value = '';

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"' && line[i + 1] === '"') {
                value += '"';
                i++;
            } else if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(value.trim());
                value = '';
            } else {
                value += char;
            }
        }
        values.push(value.trim());
        return headers.reduce((acc, header, index) => ({ ...acc, [header]: values[index] }), {});
    });
}

app.get('/api/projects', (req, res) => {
    try {
        const projects = parseCsv(PROJECTS_CSV);
        const labels = parseCsv(LABELS_CSV);
        const projectLabels = parseCsv(PROJECT_LABELS_CSV);

        const combinedData = projects.map(project => {
            const matchingCards = projectLabels
                .filter(pl => pl.project_name === project.project_name)
                .map(pl => ({
                    card_id: pl.label_name,
                    card_name: pl.label_name,
                    card_description: project.description,
                    label_id: pl.label_name,
                    label_name: pl.label_name
                }));
            return { ...project, cards: matchingCards };
        });

        res.json(combinedData);
    } catch (error) {
        console.error('❌ Error fetching projects:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/api/labels', (req, res) => {
    try {
        const labels = parseCsv(LABELS_CSV).map(label => ({ id: label.label_name, name: label.label_name }));
        res.json(labels);
    } catch (error) {
        console.error('❌ Error fetching labels:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/start-project', (req, res) => {
    console.log("📡 Received request: POST /api/start-project", req.body);
    const { projectName } = req.body;

    if (!projectName) {
        console.warn("⚠️ Project name missing in request");
        return res.status(400).json({ error: 'Project name is required.' });
    }

    try {
        const projects = parseCsv(PROJECTS_CSV);
        const project = projects.find(p => p.project_name === projectName);

        if (!project) {
            console.error("❌ Project not found in CSV:", projectName);
            return res.status(404).json({ error: 'Project not found.' });
        }

        const startupScriptPath = path.join('/home/divansh/projects', project.project_name, project.startup_script);
        console.log(`🚀 Starting project: ${projectName} with script: ${startupScriptPath}`);
        
        const child = exec(startupScriptPath, { cwd: path.dirname(startupScriptPath) });

        child.stdout.on('data', data => console.log(`📜 [${projectName}] stdout: ${data.trim()}`));
        child.stderr.on('data', data => console.error(`⚠️ [${projectName}] stderr: ${data.trim()}`));
        child.on('exit', code => console.log(`✅ [${projectName}] Process exited with code ${code}`));

        res.json({ message: 'Project started successfully!', port: project.port });
    } catch (error) {
        console.error('❌ Error starting project:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.listen(port, '100.114.43.102', () => {
    console.log(`🚀 Backend server listening on port ${port} at http://100.114.43.102:${port}`);
});
