// BACKEND (./backend/server.js or similar)
require('dotenv').config({ path: '../.env' });
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process'); // execSync removed as not needed here

const app = express();
const port = process.env.BACKEND_PORT || 3001;

// --- CORS Configuration ---
// Ensure your frontend origin (including port if needed) is listed here
const allowedOrigins = [
    'http://100.114.43.102:1025', // Assuming this is your Next.js dev server
    'http://100.114.43.102',       // Assuming this might be a production build served on port 80
    'http://100.114.43.102:80'    // Explicit port 80
];

const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like curl requests, mobile apps, etc.) - adjust if needed
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    credentials: true,
    methods: 'GET,POST,OPTIONS',
    allowedHeaders: 'Content-Type,Authorization',
};

app.use(cors(corsOptions));
// Optional: Handle preflight requests
app.options('*', cors(corsOptions));

app.use(express.json());

console.log("\ud83d\udd27 Backend starting...");
console.log(`\ud83c\udf0d Allowed Origins: ${allowedOrigins.join(', ')}`);
console.log(`\ud83d\udcbb Backend Port: ${port}`);

// --- Constants ---
const BASE_DIR = '/home/divansh/homepage'; // Define base directory
const PROJECTS_CSV = path.join(BASE_DIR, 'backend', 'projects.csv');
const LABELS_CSV = path.join(BASE_DIR, 'backend', 'labels.csv');
const PROJECT_LABELS_CSV = path.join(BASE_DIR, 'backend', 'project_labels.csv');
const PROJECTS_BASE_PATH = '/home/divansh/projects'; // Base path for project folders

// --- Utility Functions ---
function parseCsv(filePath) {
    console.log(`\ud83d\udcda Parsing CSV: ${filePath}`);
    try {
        if (!fs.existsSync(filePath)) {
            console.error(`❌ CSV file not found: ${filePath}`);
            throw new Error(`CSV file not found: ${filePath}`);
        }
        const data = fs.readFileSync(filePath, 'utf8');
        const lines = data.trim().split('\n');
        if (lines.length <= 1) return []; // Handle empty or header-only files
        const headers = lines[0].split(',').map(header => header.trim());
        return lines.slice(1).map(line => {
            // Improved CSV parsing to handle quotes properly
            const values = [];
            let currentVal = '';
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') {
                    if (inQuotes && line[i + 1] === '"') {
                        currentVal += '"'; // Handle escaped quote ""
                        i++;
                    } else {
                        inQuotes = !inQuotes;
                    }
                } else if (char === ',' && !inQuotes) {
                    values.push(currentVal.trim());
                    currentVal = '';
                } else {
                    currentVal += char;
                }
            }
            values.push(currentVal.trim()); // Add the last value

            if (values.length !== headers.length) {
                console.warn(`⚠️ Mismatched columns in line: ${line}. Expected ${headers.length}, got ${values.length}`);
                 // Pad missing values or handle differently if needed
                 while(values.length < headers.length) values.push('');
            }

            return headers.reduce((obj, header, index) => {
                obj[header] = values[index] || ''; // Ensure value exists
                return obj;
            }, {});
        });
    } catch (error) {
        console.error(`❌ Error parsing CSV ${filePath}:`, error);
        throw error; // Re-throw to be caught by endpoint handler
    }
}

// --- API Endpoints ---

app.get('/api/projects', (req, res) => {
    console.log("📡 GET /api/projects");
    try {
        const projects = parseCsv(PROJECTS_CSV);
        const labels = parseCsv(LABELS_CSV);
        const projectLabels = parseCsv(PROJECT_LABELS_CSV);

        const labelsMap = labels.reduce((acc, label) => {
            acc[label.label_name] = label; // Use label_name as key
            return acc;
        }, {});

        const projectLabelsMap = projectLabels.reduce((acc, pl) => {
            if (!acc[pl.project_name]) {
                acc[pl.project_name] = [];
            }
            acc[pl.project_name].push(pl.label_name);
            return acc;
        }, {});

        const combinedData = projects.map(project => {
            const associatedLabelNames = projectLabelsMap[project.project_name] || [];
            const projectCards = associatedLabelNames.map(labelName => {
                const labelInfo = labelsMap[labelName] || { label_name: labelName }; // Fallback if label missing
                return {
                    card_id: labelName, // Using label name as ID here, adjust if needed
                    card_name: labelName,
                    card_description: project.description, // Using project description for card
                    label_id: labelName, // Redundant? Could simplify structure
                    label_name: labelName
                };
            });

            // Add icon path relative to the public folder expectation of Next.js
            const iconPath = `/projects/${project.project_name}/${project.icon_filename}`;

            return {
                ...project,
                 // Ensure port is treated as a string if needed by frontend, but number is better for checks
                port: project.port,
                icon_path: iconPath, // Send path usable by frontend
                cards: projectCards
            };
        });

        res.json(combinedData);
    } catch (error) {
        console.error('❌ Error fetching projects:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});

app.get('/api/labels', (req, res) => {
    console.log("📡 GET /api/labels");
    try {
        const labels = parseCsv(LABELS_CSV).map(label => ({
            id: label.label_name, // Using name as ID
            name: label.label_name
        }));
        res.json(labels);
    } catch (error) {
        console.error('❌ Error fetching labels:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});

// Endpoint to check if a process is running on a specific port
app.post('/api/check-project', (req, res) => {
    console.log("📡 POST /api/check-project", req.body);
    const { port } = req.body;

    if (!port) {
        console.warn("⚠️ Port missing in check-project request");
        return res.status(400).json({ error: 'Port is required' });
    }

    // Use lsof to check if anything is listening on the TCP port
    // -i TCP:${port} : Look for internet connections on this TCP port
    // -sTCP:LISTEN : Only show processes in the LISTEN state
    // -P : Inhibits conversion of port numbers to port names (faster, more reliable)
    // -n : Inhibits conversion of network numbers to names (faster)
    // -t : Outputs only process IDs
    const command = `lsof -i TCP:${port} -sTCP:LISTEN -P -n -t`;
    console.log(`\ud83d\udd0e Executing check: ${command}`);

    exec(command, (error, stdout, stderr) => {
        // If stdout has content, a process is listening
        if (stdout && stdout.trim().length > 0) {
             console.log(`\ud83d\udfe2 Port ${port} is IN USE by PID(s): ${stdout.trim()}`);
            res.json({ running: true });
        } else {
             // No output means nothing is listening (or lsof error)
             console.log(`\u26aa\ufe0f Port ${port} is free.`);
             if (error && !stderr.includes("No such file or directory")) {
                 // Log lsof errors, except the common 'not found' case which just means no process
                 console.error(`\u26a0\ufe0f lsof error for port ${port}: ${error.message}`);
                 console.error(`\u26a0\ufe0f lsof stderr: ${stderr}`);
             }
            res.json({ running: false });
        }
    });
});


app.post('/api/start-project', (req, res) => {
    console.log("📡 POST /api/start-project", req.body);
    const { projectName } = req.body;

    if (!projectName) {
        console.warn("⚠️ Project name missing in start request");
        return res.status(400).json({ error: 'Project name is required.' });
    }

    try {
        const projects = parseCsv(PROJECTS_CSV);
        const project = projects.find(p => p.project_name === projectName);

        if (!project) {
            console.error(`❌ Project '${projectName}' not found in CSV.`);
            return res.status(404).json({ error: `Project '${projectName}' not found.` });
        }
        if (!project.startup_script) {
             console.error(`❌ Project '${projectName}' has no startup_script defined in CSV.`);
            return res.status(400).json({ error: `Startup script not defined for project '${projectName}'.`});
        }

        const projectDir = path.join(PROJECTS_BASE_PATH, project.project_name);
        const startupScriptPath = path.join(projectDir, project.startup_script);

        if (!fs.existsSync(startupScriptPath)) {
             console.error(`❌ Startup script not found at: ${startupScriptPath}`);
            return res.status(404).json({ error: `Startup script not found: ${project.startup_script}` });
        }

        console.log(`🚀 Attempting to start project: ${projectName} with script: ${startupScriptPath}`);

        // Execute the script asynchronously
        // We respond immediately, the frontend will poll '/api/check-project'
        const child = exec(startupScriptPath, { cwd: projectDir }, (error, stdout, stderr) => {
             // This callback runs when the process *exits*
            if (error) {
                console.error(`❌ Error executing script ${startupScriptPath}: ${error}`);
                return;
            }
            console.log(`📜 [${projectName}] stdout on exit: ${stdout}`);
            console.error(`⚠️ [${projectName}] stderr on exit: ${stderr}`);
        });

        // Log process events immediately
        child.stdout.on('data', data => console.log(`📜 [${projectName} stdout]: ${data.toString().trim()}`));
        child.stderr.on('data', data => console.error(`⚠️ [${projectName} stderr]: ${data.toString().trim()}`));
        child.on('error', (err) => console.error(`💥 [${projectName}] Failed to start process:`, err));
        child.on('exit', code => console.log(`✅ [${projectName}] Process exited with code ${code}`));

        // Respond quickly to the frontend, indicating the start *attempt* has begun
        res.status(202).json({ message: `Starting project ${projectName}...`, port: project.port }); // 202 Accepted

    } catch (error) {
        console.error(`❌ Error in /api/start-project for '${projectName}':`, error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});

app.post('/api/stop-project', (req, res) => {
    console.log("📡 POST /api/stop-project", req.body);
    const { projectName } = req.body;

    if (!projectName) {
        console.warn("⚠️ Project name missing in stop request");
        return res.status(400).json({ error: 'Project name is required.' });
    }

    try {
        const projects = parseCsv(PROJECTS_CSV);
        const project = projects.find(p => p.project_name === projectName);

        if (!project) {
            console.error(`❌ Project '${projectName}' not found in CSV for stopping.`);
            return res.status(404).json({ error: `Project '${projectName}' not found.` });
        }

        const port = project.port;
        if (!port) {
             console.error(`❌ Project '${projectName}' has no port defined in CSV for stopping.`);
            return res.status(400).json({ error: `Port not defined for project '${projectName}'.`});
        }

        // Command to find the PID listening on the specific TCP port
        const findPidCommand = `lsof -i TCP:${port} -sTCP:LISTEN -P -n -t`;
        console.log(`\ud83d\udd0e Finding PID on port ${port} for project ${projectName}...`);

        exec(findPidCommand, (err, stdout, stderr) => {
            const pid = stdout.trim();

            if (err || !pid) {
                console.warn(`\u26a0\ufe0f No process found listening on port ${port} for ${projectName}. Maybe already stopped?`);
                 if (err) console.error(`\u26a0\ufe0f lsof error: ${err.message}`);
                 if (stderr) console.error(`\u26a0\ufe0f lsof stderr: ${stderr}`);
                // Still return success as the desired state (stopped) is achieved
                return res.json({ message: `Project ${projectName} was not running or already stopped.` });
            }

            console.log(`🔪 Killing process PID ${pid} on port ${port} for project ${projectName}`);
            // Use kill -9 for forceful termination. Consider -15 (SIGTERM) for graceful shutdown if scripts handle it.
            exec(`kill -9 ${pid}`, (killErr, killStdout, killStderr) => {
                if (killErr) {
                    console.error(`❌ Failed to kill process ${pid} for ${projectName}:`, killErr);
                    console.error(`\u26a0\ufe0f kill stderr: ${killStderr}`);
                    // Check if the process still exists after kill attempt
                    exec(findPidCommand, (checkErr, checkStdout) => {
                         if (checkStdout && checkStdout.trim().length > 0) {
                              return res.status(500).json({ error: `Failed to stop project ${projectName} (Process ${pid} might still be running)` });
                         } else {
                              // Process is gone, even though kill command reported error (maybe permission issue initially?)
                              console.log(`\u2705 Project ${projectName} (PID ${pid}) stopped successfully despite kill error.`);
                              res.json({ message: `Project ${projectName} stopped successfully!` });
                         }
                    });

                } else {
                    console.log(`✅ Project ${projectName} (PID ${pid}) stopped successfully`);
                    res.json({ message: `Project ${projectName} stopped successfully!` });
                }
            });
        });
    } catch (error) {
        console.error(`❌ Error stopping project '${projectName}':`, error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});

// --- Server Listen ---
// Listen on the specific IP from .env or default to 0.0.0.0 (all interfaces) if not specified
const HOST = process.env.BACKEND_HOST || '0.0.0.0'; // Listen on all available network interfaces by default
app.listen(port, HOST, () => {
    console.log(`\n🚀 Backend server listening on http://${HOST}:${port}`);
    // Find the specific IP 100.114.43.102 if available for display purposes
    const networkInterfaces = require('os').networkInterfaces();
    let specificIpFound = false;
    for (const name of Object.keys(networkInterfaces)) {
        for (const net of networkInterfaces[name]) {
             // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
             if (net.family === 'IPv4' && !net.internal) {
                 if(net.address === '100.114.43.102') {
                     console.log(`   Accessible specifically at: http://100.114.43.102:${port}`);
                     specificIpFound = true;
                 }
                 // Log other available IPs too
                 if (HOST === '0.0.0.0' && net.address !== '100.114.43.102') {
                      console.log(`   Also accessible at: http://${net.address}:${port}`);
                 }
             }
        }
    }
    if(HOST !== '0.0.0.0' && HOST !== '100.114.43.102') {
         console.log(`   NOTE: Listening only on ${HOST}.`);
    }
});

// Basic Error Handling Middleware (Optional but Recommended)
app.use((err, req, res, next) => {
  console.error("💥 Unhandled Error:", err.stack);
  res.status(500).send('Something broke!');
});