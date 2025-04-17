// BACKEND (./backend/index.js or server.js) - COMPLETE FILE with Add Endpoints and ss

require('dotenv').config({ path: '../.env' }); // Ensure .env is loaded
const express = require('express');
const cors = require('cors');
const fs = require('fs').promises; // Use promises for async file operations
const fsSync = require('fs'); // Keep sync version for initial checks if needed
const path = require('path');
const { spawn, exec } = require('child_process'); // Need both

const app = express();
const port = process.env.BACKEND_PORT || 3001;
const HOST = process.env.BACKEND_HOST || '0.0.0.0';
const PROJECT_DEFAULT_HOST = process.env.PROJECT_DEFAULT_HOST || '100.94.150.11';

// --- CORS Configuration ---
const allowedOrigins = [
    `http://${PROJECT_DEFAULT_HOST}:1025`, `http://localhost:1025`, `http://100.94.150.11:1025`,
    `http://${PROJECT_DEFAULT_HOST}`, `http://localhost`, `http://100.94.150.11`
];
const corsOptions = {
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.some(allowed => origin.startsWith(allowed))) {
             return callback(null, true);
         }
        console.warn(`CORS blocked for origin: ${origin}.`); // Keep CORS warnings
        return callback(new Error('CORS policy violation'), false);
    },
    credentials: true, methods: 'GET,POST,OPTIONS', allowedHeaders: 'Content-Type,Authorization',
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());

// --- Reduced Startup Logging ---
console.log("\ud83d\udd27 Backend starting...");
console.log(`   >> Default Project Host: ${PROJECT_DEFAULT_HOST}`);
console.log(`   >> Backend Listening on: http://${HOST}:${port}`);

// --- Constants ---
const BASE_DIR = '/home/divansh/homepage'; // Adjust if necessary
const PROJECTS_CSV = path.join(BASE_DIR, 'backend', 'projects.csv');
const LABELS_CSV = path.join(BASE_DIR, 'backend', 'labels.csv');
const PROJECT_LABELS_CSV = path.join(BASE_DIR, 'backend', 'project_labels.csv');
const PROJECTS_BASE_PATH = '/home/divansh'; // Adjust if necessary

// --- Utility Functions ---
function parseCsv(filePath) {
    try {
        if (!fsSync.existsSync(filePath)) {
            console.error(`❌ CSV file not found: ${filePath}`);
            return [];
        }
        const data = fsSync.readFileSync(filePath, 'utf8');
        const lines = data.trim().split('\n');
        if (lines.length <= 1) return [];
        const headers = lines[0].split(',').map(header => header.trim().toLowerCase());
        return lines.slice(1).map(line => {
            const values = []; let currentVal = ''; let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') { if (inQuotes && line[i + 1] === '"') { currentVal += '"'; i++; } else { inQuotes = !inQuotes; } }
                else if (char === ',' && !inQuotes) { values.push(currentVal.trim()); currentVal = ''; }
                else { currentVal += char; }
            } values.push(currentVal.trim());
             if (values.length !== headers.length) {
                console.warn(`⚠️ Mismatched columns in ${path.basename(filePath)}: "${line}". Expected ${headers.length}, got ${values.length}.`);
                while (values.length < headers.length) values.push('');
            }
            return headers.reduce((obj, header, index) => { obj[header] = values[index] || ''; return obj; }, {});
        });
    } catch (error) {
        console.error(`❌ Error parsing CSV ${filePath}:`, error);
        throw error;
    }
}

function escapeCsvField(field) {
    if (field === null || typeof field === 'undefined') return '';
    const stringField = String(field);
    if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
        return `"${stringField.replace(/"/g, '""')}"`;
    }
    return stringField;
}

// --- API Endpoints ---
app.use('/project_icons', (req, res, next) => {
    // req.path will contain something like '/coder/logo.png' (after '/project_icons')
    // We need to decode the components in case they were encoded
    const requestedPath = decodeURIComponent(req.path);

    // Construct the absolute filesystem path
    // IMPORTANT: Ensure robust path joining and security checks here in a real app
    // to prevent directory traversal attacks (e.g., req.path being '../..')
    // This basic example assumes valid project/file names from your CSV.
    const absoluteFilePath = path.join(PROJECTS_BASE_PATH, requestedPath);

    // console.log(`Attempting to serve icon: ${absoluteFilePath}`); // Debugging log

    // Check if file exists and serve it
    // Use express.static's underlying 'send' for proper headers/streaming
    res.sendFile(absoluteFilePath, (err) => {
        if (err) {
            // File not found or other error
             if (err.code === "ENOENT") {
                // console.warn(`Icon not found: ${absoluteFilePath}`);
                res.status(404).send('Icon Not Found');
             } else {
                 console.error(`Error sending icon ${absoluteFilePath}:`, err);
                 res.status(500).send('Server Error');
             }
        }
        // else file is sent successfully
    });
});
// GET Projects (Reads current state)
app.get('/api/projects', (req, res) => {
    console.log("📡 GET /api/projects");
    try {
        // parseCsv reads in file order, which is now the persisted order
        const projects = parseCsv(PROJECTS_CSV);
        const labels = parseCsv(LABELS_CSV);
        const projectLabels = parseCsv(PROJECT_LABELS_CSV);

        const labelsMap = labels.reduce((acc, label) => { if (label.label_name) { acc[label.label_name.toLowerCase()] = label; } return acc; }, {});
        const projectLabelsMap = projectLabels.reduce((acc, pl) => { if (pl.project_name && pl.label_name) { const key = pl.project_name.toLowerCase(); if (!acc[key]) acc[key] = []; acc[key].push(pl.label_name.toLowerCase()); } return acc; }, {});

        const combinedData = projects.map(project => {
            if (!project.project_name) { console.warn("Skipping project missing name:", project); return null; }
            const projectNameLower = project.project_name.toLowerCase();
            const associatedLabelNames = projectLabelsMap[projectNameLower] || [];
            const projectCards = associatedLabelNames.map(labelNameLower => {
                const labelInfo = labelsMap[labelNameLower];
                const originalLabelName = labelInfo?.label_name || labelNameLower;
                const cardDesc = project.description || 'No description available.';
                return { card_id: originalLabelName, card_name: originalLabelName, card_description: cardDesc, label_id: originalLabelName, label_name: originalLabelName };
            });
            const scheme = (project.scheme?.toLowerCase() === 'https') ? 'https' : 'http';
            const host = project.host || PROJECT_DEFAULT_HOST; // Use explicit host from CSV if present
            const backendBaseUrl = `http://100.94.150.11:3001`; // e.g., http://100.94.150.11:3001

    const encodedProjectName = encodeURIComponent(project.project_name);
    const encodedFilename = encodeURIComponent(project.icon_filename);

    const iconPath = project.icon_filename
         ? `${backendBaseUrl}/project_icons/${encodedProjectName}/${encodedFilename}` // Absolute URL
         : '/label_icons/default.png'; // Keep fallback relative if it's in frontend public dir
    // --- End Correction ---
            // Return structured project data, spreading original first then overriding/adding calculated
            return {
                project_name: project.project_name, // Ensure required field is present
                description: project.description || '',
                icon_filename: project.icon_filename || '',
                startup_script: project.startup_script || '',
                port: project.port || '',
                host: host, // Use calculated host
                scheme: scheme, // Use calculated scheme
                icon_path: iconPath,
                cards: projectCards
            };
        }).filter(Boolean);
        res.json(combinedData);
    } catch (error) {
        console.error('❌ Error fetching projects:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});

// GET Labels (Reads current state)
app.get('/api/labels', (req, res) => {
    console.log("📡 GET /api/labels");
    try {
        const parsedLabels = parseCsv(LABELS_CSV);
        const labels = parsedLabels.map(label => {
            // Uses label_name as the ID now
            if (!label.label_name || !label.label_type) { console.warn("⚠️ Skipping label due to missing name or type:", label); return null; }
            return { id: label.label_name, name: label.label_name, label_type: label.label_type };
        }).filter(Boolean);
        res.json(labels);
    } catch (error) {
        console.error('❌ Error fetching labels:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});

// Check Project Status (using ss)
app.post('/api/check-project', (req, res) => {
    const { port } = req.body;
    if (!port || isNaN(parseInt(port))) {
        console.warn("⚠️ Invalid or missing port in check-project request:", port);
        return res.status(400).json({ error: 'Valid port is required' });
    }
    // Use ss to check for listening TCP socket on the port
    const command = `ss -tln 2>/dev/null | grep -E "[^0-9]${port}([^0-9]|$)" | grep -w LISTEN`;
    exec(command, (error, stdout, stderr) => {
        if (stdout && stdout.trim().length > 0) {
            // Match found, process is listening
            res.json({ running: true });
        } else {
            // No match or error
            if (error && error.code !== 1) { // Ignore grep exit code 1 (no match)
                console.error(`\u26a0\ufe0f Error executing ss check for port ${port}: ${error.message}`);
                console.error(`\u26a0\ufe0f ss stderr: ${stderr}`);
            }
            res.json({ running: false });
        }
    });
});

// Start Project (Detached)
app.post('/api/start-project', (req, res) => {
    console.log("📡 POST /api/start-project", req.body);
    const { projectName } = req.body;
    if (!projectName) {
        console.warn("⚠️ Project name missing in start request");
        return res.status(400).json({ error: 'Project name required.' });
    }
    try {
        const projects = parseCsv(PROJECTS_CSV);
        const project = projects.find(p => p.project_name === projectName);

        if (!project) { console.error(`❌ Project '${projectName}' not found.`); return res.status(404).json({ error: `Project '${projectName}' not found.` }); }
        if (!project.startup_script) { console.error(`❌ No startup script for '${projectName}'.`); return res.status(400).json({ error: `Startup script not defined for '${projectName}'.` }); }

        const projectDir = path.join(PROJECTS_BASE_PATH, project.project_name);
        const startupScriptPath = path.join(projectDir, project.startup_script);

        if (!fsSync.existsSync(projectDir)) { console.error(`❌ Dir not found: ${projectDir}`); return res.status(404).json({ error: `Project directory not found for '${projectName}'` });}
        if (!fsSync.existsSync(startupScriptPath)) { console.error(`❌ Script not found: ${startupScriptPath}`); return res.status(404).json({ error: `Startup script not found: ${project.startup_script}` }); }

        console.log(`🚀 Spawning detached process for '${projectName}'`);
        const spawnOptions = { cwd: projectDir, detached: true, stdio: 'ignore', shell: true };
        const child = spawn('nohup', [startupScriptPath], spawnOptions);
        child.on('error', (spawnError) => console.error(`💥 Spawn error ${projectName}:`, spawnError));
        child.unref();
        console.log(`✅ Disowned process initiated for ${projectName}.`);
        res.status(202).json({ message: `Initiated detached start for project '${projectName}'.`, port: project.port });
    } catch (error) {
        console.error(`❌ Error processing /api/start-project for '${projectName}':`, error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});

// Stop Project (using ss and kill)
app.post('/api/stop-project', (req, res) => {
    console.log("📡 POST /api/stop-project", req.body);
    const { projectName } = req.body;
    if (!projectName) {
        console.warn("⚠️ Project name missing in stop request");
        return res.status(400).json({ error: 'Project name required.' });
    }
    try {
        const projects = parseCsv(PROJECTS_CSV);
        const project = projects.find(p => p.project_name === projectName);

        if (!project) { console.error(`❌ Project '${projectName}' not found for stopping.`); return res.status(404).json({ error: `Project '${projectName}' not found.` }); }
        const port = project.port;
        if (!port || isNaN(parseInt(port))) { console.error(`❌ Project '${projectName}' invalid port: ${port}`); return res.status(400).json({ error: `Valid port not defined for '${projectName}'.`}); }

        // Use ss with -p to find PID (requires privilege)
        const findPidCommand = `ss -tlnp 2>/dev/null | grep -E "[^0-9]${port}([^0-9]|$)" | grep -w LISTEN`;
        const pidRegex = /pid=(\d+)/;

        exec(findPidCommand, (err, stdout, stderr) => {
            let pid = null;
            if (stdout) { const match = stdout.match(pidRegex); if (match && match[1]) pid = match[1]; }

            if (err && err.code !== 1) { console.error(`\u26a0\ufe0f Error executing ss PID find port ${port}:`, err.message); return res.status(500).json({ error: `Failed check status ${projectName}` }); }

            if (!pid) {
                if (stdout && stdout.trim().length > 0) { console.error(`❌ Cannot stop ${projectName}: Found listener on port ${port}, but failed to get PID (permissions?)`); return res.status(500).json({ error: `Cannot stop ${projectName}: Unable to get PID` }); }
                else { console.warn(`\u26a0\ufe0f No process found port ${port} for ${projectName}.`); return res.json({ message: `${projectName} not running.` }); }
            }

            // PID Found, attempt kill
            exec(`kill -9 ${pid}`, (killErr) => {
                if (killErr) {
                    console.error(`❌ Kill fail PID ${pid} for ${projectName}:`, killErr);
                     // Re-check if the *same* PID is still running
                     exec(findPidCommand, (checkErr, checkStdout) => {
                          let stillRunningPid = null; if (checkStdout) { const checkMatch = checkStdout.match(pidRegex); if (checkMatch && checkMatch[1]) stillRunningPid = checkMatch[1]; }
                          if (stillRunningPid === pid) { console.error(`\u274c PID ${pid} ${projectName} STILL RUNNING.`); return res.status(500).json({ error: `Failed stop ${projectName} (PID ${pid} still running)` }); }
                          else { console.log(`\u2705 ${projectName} (PID ${pid}) stopped despite kill error.`); res.json({ message: `${projectName} stopped.` }); }
                     });
                } else {
                    console.log(`✅ Project ${projectName} (PID ${pid}) stopped successfully.`);
                    res.json({ message: `${projectName} stopped successfully!` });
                }
            });
        });
    } catch (error) {
        console.error(`❌ Error stop ${projectName}:`, error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});

// --- Add Label Endpoint ---
app.post('/api/add-label', async (req, res) => {
    console.log("📡 POST /api/add-label", req.body);
    const { name, type } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Label name is required.' });
    if (!type || !['language', 'utility'].includes(type)) return res.status(400).json({ error: 'Valid label type required.' });

    const trimmedName = name.trim();
    const csvLine = `\n${escapeCsvField(trimmedName)},${escapeCsvField(type)}`;
    try {
        const existingLabels = parseCsv(LABELS_CSV); // Read current labels
        if (existingLabels.some(l => l.label_name?.toLowerCase() === trimmedName.toLowerCase())) {
            return res.status(409).json({ error: `Label '${trimmedName}' already exists.` });
        }
        await fs.appendFile(LABELS_CSV, csvLine, 'utf8'); // Append async
        console.log(`✅ Label added: ${trimmedName}, Type: ${type}`);
        res.status(201).json({ message: `Label '${trimmedName}' added.` });
    } catch (error) {
        console.error(`❌ Error adding label '${trimmedName}':`, error);
        res.status(500).json({ error: 'Failed to write to labels file.' });
    }
});

// --- Add Project Endpoint ---
app.post('/api/add-project', async (req, res) => {
    console.log("📡 POST /api/add-project", req.body);
    const { projectName, description = '', iconFilename = '', startupScript, scheme = 'http', port, host, selectedLabels = [] } = req.body;

    // Basic Validation
    if (!projectName?.trim()) return res.status(400).json({ error: 'Project name required.' });
    if (!startupScript?.trim()) return res.status(400).json({ error: 'Startup script required.' });
    if (!port || isNaN(parseInt(port))) return res.status(400).json({ error: 'Valid port required.' });
    if (!Array.isArray(selectedLabels)) return res.status(400).json({ error: 'Selected labels must be an array.' });

    const trimmedProjectName = projectName.trim();
    const finalHost = (host && host.trim().length > 0) ? host.trim() : PROJECT_DEFAULT_HOST;
    const finalScheme = (scheme === 'https') ? 'https' : 'http'; // Normalize scheme

    try {
         const existingProjects = parseCsv(PROJECTS_CSV);
         if (existingProjects.some(p => p.project_name?.toLowerCase() === trimmedProjectName.toLowerCase())) {
             return res.status(409).json({ error: `Project name '${trimmedProjectName}' already exists.` });
         }
    } catch (readError){ console.error("Warn: Could not check project name uniqueness:", readError); }

    // Prepare CSV Lines
    const projectCsvLine = [
        escapeCsvField(trimmedProjectName), escapeCsvField(description), escapeCsvField(iconFilename),
        escapeCsvField(startupScript.trim()), escapeCsvField(finalScheme), escapeCsvField(String(port).trim()),
        escapeCsvField(finalHost)
    ].join(',');
    const projectLabelCsvLines = selectedLabels
        .map(labelName => (typeof labelName === 'string' && labelName.trim()) ? `\n${escapeCsvField(trimmedProjectName)},${escapeCsvField(labelName.trim())}` : null)
        .filter(Boolean).join('');

    // Append to Files Asynchronously
    try {
        await fs.appendFile(PROJECTS_CSV, `\n${projectCsvLine}`, 'utf8');
        console.log(`✅ Project added: ${trimmedProjectName}`);
        if (projectLabelCsvLines.length > 0) {
            await fs.appendFile(PROJECT_LABELS_CSV, projectLabelCsvLines, 'utf8');
            console.log(`✅ Labels added for ${trimmedProjectName}: ${selectedLabels.join(', ')}`);
        }
        res.status(201).json({ message: `Project '${trimmedProjectName}' added.` });
    } catch (error) {
        console.error(`❌ Error adding project '${trimmedProjectName}' to files:`, error);
        res.status(500).json({ error: 'Failed to write project data.' });
    }
});
// --- NEW: Save Project Order Endpoint ---
// --- Find and Replace this endpoint ---
app.post('/api/projects/order', async (req, res) => {
    console.log("📡 POST /api/projects/order");
    const { newOrder } = req.body;

    if (!Array.isArray(newOrder) || !newOrder.every(item => typeof item === 'string')) {
        return res.status(400).json({ error: 'Invalid project order data. Expected an array of strings.' });
    }

    try {
        // 1. Read current project data
        const existingProjects = parseCsv(PROJECTS_CSV);
        if (!Array.isArray(existingProjects)) {
            console.error("Failed to parse existing projects CSV or file is empty.");
            throw new Error("Could not read existing project data.");
        }
        const existingProjectsMap = existingProjects.reduce((map, proj) => {
            if (proj.project_name) { map[proj.project_name] = proj; }
            return map;
        }, {}); // No type assertion needed

        // 2. Create reordered list
        const reorderedProjects = [];
        const includedProjectNames = new Set(); // No <string> needed

        newOrder.forEach(projectName => {
            if (existingProjectsMap[projectName]) {
                reorderedProjects.push(existingProjectsMap[projectName]);
                includedProjectNames.add(projectName);
            } else {
                console.warn(`⚠️ Project name "${projectName}" from new order not found. Skipping.`);
            }
        });

        // 3. Append missing projects
        existingProjects.forEach(proj => {
            if (proj.project_name && !includedProjectNames.has(proj.project_name)) {
                console.warn(`⚠️ Project "${proj.project_name}" not in order. Appending.`);
                reorderedProjects.push(proj);
            }
        });

        // 4. Format to CSV
        const headerRow = PROJECT_CSV_HEADERS.join(',');
        const dataRows = reorderedProjects.map(proj => {
            // --- CORRECTED accessing proj[header] ---
            return PROJECT_CSV_HEADERS.map(header => escapeCsvField(proj[header])).join(','); // <<< REMOVED '(proj as any)[header]'
            // --- End Correction ---
        });
        const newCsvContent = dataRows.length > 0
            ? [headerRow, ...dataRows].join('\n') + '\n'
            : headerRow + '\n';

        // 5. Overwrite the file
        await fs.writeFile(PROJECTS_CSV, newCsvContent, 'utf8');

        console.log(`✅ Project order saved successfully to ${PROJECTS_CSV}.`);
        res.status(200).json({ message: 'Project order saved successfully.' });

    } catch (error) {
        console.error(`❌ Error saving project order:`, error);
        res.status(500).json({ error: 'Internal Server Error', details: 'Failed to save project order.' });
    }
});
// --- End of endpoint block ---
// --- Server Listen ---
app.listen(port, HOST, () => {
    console.log(`\n🚀 Backend server ready on http://${HOST}:${port}`);
});

// --- Basic Error Handling Middleware ---
app.use((err, req, res, next) => {
  console.error("💥 Unhandled Error:", err.stack || err);
  const errorDetails = process.env.NODE_ENV === 'production' ? 'Internal error' : err.message;
  if (!res.headersSent) { res.status(500).json({ error: 'Something broke!', details: errorDetails }); }
});
