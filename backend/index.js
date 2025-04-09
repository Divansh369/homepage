// BACKEND (./backend/index.js or server.js)

require('dotenv').config({ path: '../.env' }); // Ensure .env is loaded
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process'); // Need both

const app = express();
const port = process.env.BACKEND_PORT || 3001;
const HOST = process.env.BACKEND_HOST || '0.0.0.0';
// Read the default host for projects from .env, fallback if not set
const PROJECT_DEFAULT_HOST = process.env.PROJECT_DEFAULT_HOST || '100.114.43.102';

// --- CORS Configuration ---
const allowedOrigins = [
    `http://${PROJECT_DEFAULT_HOST}:1025`,
    `http://localhost:1025`,
    `http://100.114.43.102:1025`,
    `http://${PROJECT_DEFAULT_HOST}`,
    `http://localhost`,
    `http://100.114.43.102`
];

const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like curl requests) or from allowed origins
        if (!origin || allowedOrigins.some(allowed => origin.startsWith(allowed))) {
             return callback(null, true);
         }
        // Log only CORS rejections
        console.warn(`CORS blocked for origin: ${origin}. Allowed: ${allowedOrigins.join(', ')}`);
        const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
        return callback(new Error(msg), false);
    },
    credentials: true,
    methods: 'GET,POST,OPTIONS',
    allowedHeaders: 'Content-Type,Authorization',
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Handle preflight requests
app.use(express.json());

// --- Reduced Startup Logging ---
console.log("\ud83d\udd27 Backend starting...");
console.log(`   >> Default Project Host: ${PROJECT_DEFAULT_HOST}`);
console.log(`   >> Backend Listening on: http://${HOST}:${port}`);

// --- Constants ---
const BASE_DIR = '/home/divansh/homepage'; // Adjust if your base directory is different
const PROJECTS_CSV = path.join(BASE_DIR, 'backend', 'projects.csv');
const LABELS_CSV = path.join(BASE_DIR, 'backend', 'labels.csv');
const PROJECT_LABELS_CSV = path.join(BASE_DIR, 'backend', 'project_labels.csv');
const PROJECTS_BASE_PATH = '/home/divansh/projects'; // Adjust if your projects live elsewhere

// --- Utility Functions ---
function parseCsv(filePath) {
    // console.log(`\ud83d\udcda Parsing CSV: ${filePath}`); // Reduced logging
    try {
        if (!fs.existsSync(filePath)) {
            console.error(`❌ CSV file not found: ${filePath}`); // Keep errors
            throw new Error(`CSV file not found: ${filePath}`);
        }
        const data = fs.readFileSync(filePath, 'utf8');
        const lines = data.trim().split('\n');
        if (lines.length <= 1) return []; // Handle empty or header-only file
        const headers = lines[0].split(',').map(header => header.trim().toLowerCase()); // Use lowercase headers

        return lines.slice(1).map(line => {
            // Improved CSV parsing to handle quotes
            const values = [];
            let currentVal = '';
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') {
                    // Handle escaped quotes "" inside quoted field
                    if (inQuotes && line[i + 1] === '"') {
                        currentVal += '"';
                        i++; // Skip the next quote
                    } else {
                        inQuotes = !inQuotes; // Toggle quoted state
                    }
                } else if (char === ',' && !inQuotes) {
                    // End of a field if comma is found outside quotes
                    values.push(currentVal.trim());
                    currentVal = '';
                } else {
                    // Append character to current field value
                    currentVal += char;
                }
            }
            values.push(currentVal.trim()); // Add the last value

             // Check for mismatched column count
             if (values.length !== headers.length) {
                // Keep mismatched columns warning
                console.warn(`⚠️ Mismatched columns in line of ${path.basename(filePath)}: "${line}". Expected ${headers.length}, got ${values.length}.`);
                // Pad with empty strings to avoid errors later
                while (values.length < headers.length) values.push('');
            }

            // Create object from headers and values
            return headers.reduce((obj, header, index) => {
                obj[header] = values[index] || ''; // Ensure value exists, default to empty string
                return obj;
            }, {});
        });
    } catch (error) {
        console.error(`❌ Error parsing CSV ${filePath}:`, error); // Keep errors
        throw error; // Re-throw to be caught by endpoint handler
    }
}


// --- API Endpoints ---

app.get('/api/projects', (req, res) => {
    console.log("📡 GET /api/projects"); // Keep endpoint entry log
    try {
        const projects = parseCsv(PROJECTS_CSV);
        const labels = parseCsv(LABELS_CSV);
        const projectLabels = parseCsv(PROJECT_LABELS_CSV);

        // --- Data Aggregation Logic (Keep Warnings) ---
        const labelsMap = labels.reduce((acc, label) => {
             if(label.label_name) { acc[label.label_name.toLowerCase()] = label; }
             else { console.warn("Skipping label due to missing 'label_name':", label); }
            return acc;
        }, {});
        const projectLabelsMap = projectLabels.reduce((acc, pl) => {
             if (pl.project_name && pl.label_name) {
                 const projNameLower = pl.project_name.toLowerCase();
                 if (!acc[projNameLower]) { acc[projNameLower] = []; }
                 acc[projNameLower].push(pl.label_name.toLowerCase());
             } else { console.warn("Skipping project_label due to missing fields:", pl); }
            return acc;
        }, {});

        const combinedData = projects.map(project => {
            if (!project.project_name) {
                 console.warn("Skipping project due to missing 'project_name':", project);
                 return null;
             }
             const projectNameLower = project.project_name.toLowerCase();
             const associatedLabelNames = projectLabelsMap[projectNameLower] || [];
             const projectCards = associatedLabelNames.map(labelNameLower => {
                 const labelInfo = labelsMap[labelNameLower];
                 const originalLabelName = labelInfo?.label_name || labelNameLower;
                 const cardDescription = project.description || 'No project description available.';
                 return {
                     card_id: originalLabelName, card_name: originalLabelName,
                     card_description: cardDescription, label_id: originalLabelName,
                     label_name: originalLabelName
                 };
             });
            const scheme = (project.scheme && ['http', 'https'].includes(project.scheme.toLowerCase()))
                ? project.scheme.toLowerCase() : 'http';
            const host = PROJECT_DEFAULT_HOST; // Use configured default host
            const iconPath = project.icon_filename
                 ? `/projects/${project.project_name}/${project.icon_filename}`
                 : '/label_icons/default.png'; // Fallback icon

            // Return structured project data
            return {
                project_name: project.project_name, description: project.description || '',
                icon_filename: project.icon_filename || '', startup_script: project.startup_script || '',
                port: project.port || '', scheme: scheme, host: host,
                icon_path: iconPath, cards: projectCards
            };
        }).filter(Boolean); // Filter out any null projects from the map

        res.json(combinedData);
    } catch (error) {
        console.error('❌ Error fetching projects:', error); // Keep errors
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        res.status(500).json({ error: 'Internal Server Error', details: errorMessage });
    }
});


app.get('/api/labels', (req, res) => {
    console.log("📡 GET /api/labels"); // Keep endpoint entry log
    try {
        const labels = parseCsv(LABELS_CSV).map(label => ({
            id: label.label_name || `missing_label_${Math.random()}`, // Use name as ID, fallback
            name: label.label_name || 'Unknown Label'
        })).filter(label => !label.id.startsWith('missing_label_')); // Filter invalid ones
        res.json(labels);
    } catch (error) {
        console.error('❌ Error fetching labels:', error); // Keep errors
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});


// --- Check Project Status using 'ss' ---
app.post('/api/check-project', (req, res) => {
    // console.log("📡 POST /api/check-project", req.body); // Reduced logging
    const { port } = req.body;

    // Validate port input
    if (!port || isNaN(parseInt(port))) {
        console.warn("⚠️ Invalid or missing port in check-project request:", port); // Keep warnings
        return res.status(400).json({ error: 'Valid port is required' });
    }

    // Command using ss: -t(TCP), -l(listening), -n(numeric)
    // Grep for the specific port number ensuring it's delimited (not part of another number)
    // and that the socket is in the LISTEN state.
    const command = `ss -tln 2>/dev/null | grep -E "[^0-9]${port}([^0-9]|$)" | grep -w LISTEN`;
    // Note: 2>/dev/null hides potential minor errors. We don't need -p just to check listening status.

    exec(command, (error, stdout, stderr) => {
        // If stdout has content, grep found a match, meaning it's listening
        if (stdout && stdout.trim().length > 0) {
             // console.log(`\ud83d\udfe2 Port ${port} is IN USE.`); // Reduced logging
             res.json({ running: true });
        } else {
             // No output means nothing is listening, or grep found no match.
             // console.log(`\u26aa\ufe0f Port ${port} is free.`); // Reduced logging

             // Handle potential errors from exec, ignoring grep's exit code 1 (no match found)
             if (error && error.code !== 1) {
                console.error(`\u26a0\ufe0f Error executing ss check for port ${port}: ${error.message}`); // Keep errors
                console.error(`\u26a0\ufe0f ss stderr: ${stderr}`); // Keep errors
             }
             // If no stdout and no error (or only grep exit code 1), it's not running
             res.json({ running: false });
        }
    });
});


// --- Start Project (Detached) ---
app.post('/api/start-project', (req, res) => {
    console.log("📡 POST /api/start-project", req.body); // Keep endpoint entry log
    const { projectName } = req.body;

    if (!projectName) {
        console.warn("⚠️ Project name missing in start request"); // Keep warning
        return res.status(400).json({ error: 'Project name is required.' });
    }

    try {
        const projects = parseCsv(PROJECTS_CSV);
        const project = projects.find(p => p.project_name === projectName);

        // --- Input Validation (Keep Errors) ---
        if (!project) {
            console.error(`❌ Project '${projectName}' not found in CSV.`);
            return res.status(404).json({ error: `Project '${projectName}' not found.` });
        }
        if (!project.startup_script) {
            console.error(`❌ Project '${projectName}' has no 'startup_script' defined.`);
            return res.status(400).json({ error: `Startup script not defined for '${projectName}'.` });
        }

        const projectDir = path.join(PROJECTS_BASE_PATH, project.project_name);
        const startupScriptPath = path.join(projectDir, project.startup_script);

        if (!fs.existsSync(projectDir)) {
             console.error(`❌ Project directory not found at: ${projectDir}`);
             return res.status(404).json({ error: `Project directory not found for '${projectName}'` });
        }
        if (!fs.existsSync(startupScriptPath)) {
            console.error(`❌ Startup script not found at: ${startupScriptPath}`);
            return res.status(404).json({ error: `Startup script not found: ${project.startup_script}` });
        }

        // --- Spawn Detached Process (Keep Action Logs) ---
        console.log(`🚀 Spawning detached process for '${projectName}'`);
        const spawnOptions = {
            cwd: projectDir, detached: true, stdio: 'ignore', shell: true
        };
        const child = spawn('nohup', [startupScriptPath], spawnOptions);

        // Handle errors *during the spawn attempt itself*
        child.on('error', (spawnError) => {
            console.error(`💥 Failed to spawn process for ${projectName}:`, spawnError); // Keep error
            // Cannot reliably send error response here as 202 might have been sent
        });
        child.unref(); // Allow parent to exit independently

        console.log(`✅ Disowned process initiated for ${projectName}.`); // Keep confirmation

        // Respond 202 Accepted immediately
        res.status(202).json({
            message: `Successfully initiated detached start for project '${projectName}'.`,
            port: project.port
        });

    } catch (error) {
        console.error(`❌ Error processing /api/start-project for '${projectName}':`, error); // Keep error
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});


// --- Stop Project using 'ss' and 'kill' ---
app.post('/api/stop-project', (req, res) => {
     console.log("📡 POST /api/stop-project", req.body); // Keep endpoint entry log
    const { projectName } = req.body;

    if (!projectName) {
        console.warn("⚠️ Project name missing in stop request"); // Keep warning
        return res.status(400).json({ error: 'Project name is required.' });
    }

    try {
        const projects = parseCsv(PROJECTS_CSV);
        const project = projects.find(p => p.project_name === projectName);

        // --- Input Validation (Keep Errors) ---
        if (!project) {
            console.error(`❌ Project '${projectName}' not found for stopping.`);
            return res.status(404).json({ error: `Project '${projectName}' not found.` });
        }
        const port = project.port;
        if (!port || isNaN(parseInt(port))) {
             console.error(`❌ Project '${projectName}' has invalid/missing port for stopping: ${port}`);
            return res.status(400).json({ error: `Valid port not defined for project '${projectName}'.`});
        }

        // --- Find PID using 'ss -p' (Requires Privilege) ---
        // Command: ss -t(TCP), -l(listening), -n(numeric), -p(program/PID)
        // Filter for the specific port in LISTEN state
        const findPidCommand = `ss -tlnp 2>/dev/null | grep -E "[^0-9]${port}([^0-9]|$)" | grep -w LISTEN`;
        // Regex to extract PID from ss output like: users:(("...",pid=12345,...))
        const pidRegex = /pid=(\d+)/;

        // console.log(`\ud83d\udd0e Finding PID on port ${port} via ss...`); // Reduced logging

        exec(findPidCommand, (err, stdout, stderr) => {
            let pid = null;
            // --- PID Extraction Logic ---
            if (stdout) {
                const lines = stdout.trim().split('\n');
                if (lines.length > 0) {
                     const match = lines[0].match(pidRegex);
                     if (match && match[1]) {
                         pid = match[1]; // PID found
                     } else {
                          // Process is listening, but PID not found in output
                          console.warn(`\u26a0\ufe0f Process found on port ${port}, but PID extraction failed (permissions for 'ss -p'?). Output: ${lines[0]}`);
                     }
                }
            }

            // --- Handle Errors during PID Find ---
            // Ignore grep's exit code 1 (no match found)
            if (err && err.code !== 1) {
                 console.error(`\u26a0\ufe0f Error executing ss PID find for port ${port}: ${err.message}`); // Keep error
                 console.error(`\u26a0\ufe0f ss stderr: ${stderr}`); // Keep error
                 return res.status(500).json({ error: `Failed to check status for project ${projectName}` });
            }

            // --- Logic based on PID Find Result ---
            if (!pid) {
                // Case 1: Process was listening, but PID couldn't be extracted (likely permissions)
                if (stdout && stdout.trim().length > 0) {
                     console.error(`❌ Cannot stop ${projectName}: Process found on port ${port}, but failed to get PID (permissions for 'ss -p'?)`); // Keep specific error
                     return res.status(500).json({ error: `Cannot stop ${projectName}: Unable to get process PID (check backend permissions for 'ss -p')` });
                }
                // Case 2: Process was genuinely not listening
                else {
                     console.warn(`\u26a0\ufe0f No process found listening on port ${port} for ${projectName} via ss. Maybe already stopped?`); // Keep warning
                     return res.json({ message: `Project ${projectName} was not running or already stopped.` });
                }
            }

            // --- PID Found - Attempt to Kill ---
            // console.log(`🔪 Killing process PID ${pid} on port ${port} for project ${projectName}`); // Reduced logging
            exec(`kill -9 ${pid}`, (killErr, killStdout, killStderr) => {
                // --- Handle Kill Attempt Result ---
                if (killErr) {
                    console.error(`❌ Failed to kill process ${pid} for ${projectName}:`, killErr); // Keep error
                    console.error(`\u26a0\ufe0f kill stderr: ${killStderr}`); // Keep error

                     // Re-check if the *same* PID is still running using ss
                     exec(findPidCommand, (checkErr, checkStdout, checkStderr) => {
                          let stillRunningPid = null;
                          if(checkStdout) {
                               const checkLines = checkStdout.trim().split('\n');
                               if (checkLines.length > 0) {
                                    const checkMatch = checkLines[0].match(pidRegex);
                                    if (checkMatch && checkMatch[1]) {
                                        stillRunningPid = checkMatch[1];
                                    }
                               }
                          }
                          // If the same PID is still found listening, kill failed
                          if (stillRunningPid === pid) {
                               console.error(`\u274c Process ${pid} for ${projectName} STILL RUNNING after kill attempt.`); // Keep error
                               return res.status(500).json({ error: `Failed to stop project ${projectName} (Process ${pid} might still be running)` });
                          } else {
                               // Process is gone, even though kill reported an error (maybe race condition?)
                               console.log(`\u2705 Project ${projectName} (PID ${pid}) stopped successfully despite initial kill error.`); // Keep info
                               res.json({ message: `Project ${projectName} stopped successfully!` });
                          }
                     });
                } else {
                    // Kill command succeeded without error
                    // console.log(`✅ Project ${projectName} (PID ${pid}) stopped successfully`); // Reduced logging
                    res.json({ message: `Project ${projectName} stopped successfully!` });
                }
            });
        });
    } catch (error) {
        console.error(`❌ Error processing /api/stop-project for '${projectName}':`, error); // Keep error
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});


// --- Server Listen ---
app.listen(port, HOST, () => {
    console.log(`\n🚀 Backend server ready.`); // Simplified ready message
    // Optional: Log network interfaces for debugging network accessibility
    /*
    try {
        const networkInterfaces = require('os').networkInterfaces();
        console.log("   Network interfaces found:");
        for (const name of Object.keys(networkInterfaces)) {
            for (const net of networkInterfaces[name]) {
                 if (net.family === 'IPv4' && !net.internal) {
                      console.log(`   - ${name}: http://${net.address}:${port}`);
                 }
            }
        }
        if (HOST !== '0.0.0.0') {
             console.log(`   NOTE: Listening specifically on host ${HOST}. May not be accessible externally.`);
        }
    } catch (e) { console.warn("Could not list network interfaces:", e); }
    */
});

// --- Basic Error Handling Middleware ---
// Catches errors thrown from synchronous code in route handlers or passed via next(err)
app.use((err, req, res, next) => {
  console.error("💥 Unhandled Error:", err.stack || err); // Keep unhandled errors logged
  // Avoid sending stack trace in production, but useful in dev
  const errorDetails = process.env.NODE_ENV === 'production' ? 'An internal error occurred' : err.message;
  res.status(500).json({ error: 'Something broke!', details: errorDetails });
});