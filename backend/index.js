// BACKEND (./backend/server.js or similar)

// ... other require statements, constants ...
require('dotenv').config({ path: '../.env' }); // Ensure .env is loaded
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const app = express();
const port = process.env.BACKEND_PORT || 3001;
const HOST = process.env.BACKEND_HOST || '0.0.0.0';
// Read the default host for projects from .env, fallback to localhost
const PROJECT_DEFAULT_HOST = process.env.PROJECT_DEFAULT_HOST || '100.114.43.102';

// --- CORS Configuration ---
// Ensure your frontend origin is listed here
const allowedOrigins = [
    `http://${PROJECT_DEFAULT_HOST}:1025`, // Dynamic based on PROJECT_DEFAULT_HOST
    `http://localhost:1025`,            // Common Next.js dev port
    `http://100.114.43.102:1025`,       // Keep specific IP if needed
    // Add production frontend origins if different
    `http://${PROJECT_DEFAULT_HOST}`,
    `http://localhost`,
    `http://100.114.43.102`
]; // Add more origins as needed

const corsOptions = {
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.some(allowed => origin.startsWith(allowed))) {
             return callback(null, true);
         }
        // Debugging log:
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

console.log("\ud83d\udd27 Backend starting...");
console.log(`\ud83c\udf10 Default Project Host: ${PROJECT_DEFAULT_HOST}`); // Log the project host being used
console.log(`\ud83c\udf0d Allowed CORS Origins: ${allowedOrigins.join(', ')}`);
console.log(`\ud83d\udcbb Backend Listening on: http://${HOST}:${port}`);

// --- Constants ---
const BASE_DIR = '/home/divansh/homepage';
const PROJECTS_CSV = path.join(BASE_DIR, 'backend', 'projects.csv');
const LABELS_CSV = path.join(BASE_DIR, 'backend', 'labels.csv');
const PROJECT_LABELS_CSV = path.join(BASE_DIR, 'backend', 'project_labels.csv');
const PROJECTS_BASE_PATH = '/home/divansh/projects';

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
        if (lines.length <= 1) return [];
        const headers = lines[0].split(',').map(header => header.trim().toLowerCase()); // Use lowercase headers for consistency
        return lines.slice(1).map(line => {
            const values = [];
            let currentVal = '';
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') {
                    if (inQuotes && line[i + 1] === '"') {
                        currentVal += '"'; i++;
                    } else {
                        inQuotes = !inQuotes;
                    }
                } else if (char === ',' && !inQuotes) {
                    values.push(currentVal.trim()); currentVal = '';
                } else {
                    currentVal += char;
                }
            }
            values.push(currentVal.trim());

             // Use headers.length for comparison
             if (values.length !== headers.length) {
                console.warn(`⚠️ Mismatched columns in line of ${path.basename(filePath)}: "${line}". Expected ${headers.length} based on headers (${headers.join(',')}), got ${values.length}. Padding with empty strings.`);
                while (values.length < headers.length) values.push('');
            }

            return headers.reduce((obj, header, index) => {
                obj[header] = values[index] || ''; // Use lowercase header as key
                return obj;
            }, {});
        });
    } catch (error) {
        console.error(`❌ Error parsing CSV ${filePath}:`, error);
        throw error;
    }
}


// --- API Endpoints ---

// **** THIS IS THE BLOCK TO REPLACE/UPDATE ****
app.get('/api/projects', (req, res) => {
    console.log("📡 GET /api/projects");
    try {
        // Ensure headers are read correctly (lowercase recommended)
        const projects = parseCsv(PROJECTS_CSV);
        const labels = parseCsv(LABELS_CSV);
        const projectLabels = parseCsv(PROJECT_LABELS_CSV);

        // Normalize label keys for maps (using lowercase name)
        const labelsMap = labels.reduce((acc, label) => {
             if(label.label_name) { // Check if label_name exists
                 acc[label.label_name.toLowerCase()] = label;
             } else {
                 console.warn("Skipping label due to missing 'label_name' field:", label);
             }
            return acc;
        }, {});

        const projectLabelsMap = projectLabels.reduce((acc, pl) => {
             if (pl.project_name && pl.label_name) { // Check required fields
                 const projNameLower = pl.project_name.toLowerCase();
                 if (!acc[projNameLower]) {
                     acc[projNameLower] = [];
                 }
                 acc[projNameLower].push(pl.label_name.toLowerCase()); // Store lowercase label name
             } else {
                 console.warn("Skipping project_label entry due to missing fields:", pl);
             }
            return acc;
        }, {});

        const combinedData = projects.map(project => {
            // Check for essential project fields
            if (!project.project_name) {
                 console.warn("Skipping project due to missing 'project_name':", project);
                 return null; // Skip this project if it's invalid
             }
             const projectNameLower = project.project_name.toLowerCase();

             const associatedLabelNames = projectLabelsMap[projectNameLower] || [];
             const projectCards = associatedLabelNames.map(labelNameLower => {
                 const labelInfo = labelsMap[labelNameLower];
                 const originalLabelName = labelInfo?.label_name || labelNameLower; // Get original case if possible

                 // Use project description for card or fallback
                 const cardDescription = project.description || 'No project description available.';

                 return {
                     // Assuming card_id/name/label_id use the label name
                     card_id: originalLabelName,
                     card_name: originalLabelName,
                     card_description: cardDescription,
                     label_id: originalLabelName,
                     label_name: originalLabelName
                 };
             });

            // --- NEW: Handle scheme and host ---
            const scheme = (project.scheme && ['http', 'https'].includes(project.scheme.toLowerCase()))
                ? project.scheme.toLowerCase() // Use scheme from CSV if valid
                : 'http'; // Default to 'http' if missing or invalid

            // Use the PROJECT_DEFAULT_HOST determined earlier
            const host = PROJECT_DEFAULT_HOST;
            // --- End NEW ---

            // Construct icon path relative to public folder expectation
             // Ensure icon_filename exists before creating path
             const iconPath = project.icon_filename
                 ? `/projects/${project.project_name}/${project.icon_filename}`
                 : '/label_icons/default.png'; // Fallback icon path


            return {
                // Include all original fields from the project CSV row
                project_name: project.project_name,
                description: project.description || '', // Ensure description exists
                icon_filename: project.icon_filename || '', // Ensure icon_filename exists
                startup_script: project.startup_script || '', // Ensure startup_script exists

                // Add the processed/derived fields
                port: project.port || '', // Ensure port exists
                scheme: scheme,         // Add the determined scheme
                host: host,             // Add the determined host
                icon_path: iconPath,    // Add path usable by frontend
                cards: projectCards     // Add associated labels/cards
            };
        }).filter(Boolean); // Filter out any null projects from the map

        res.json(combinedData);
    } catch (error) {
        console.error('❌ Error fetching projects:', error);
        // Send more specific error if possible, fallback to generic
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        res.status(500).json({ error: 'Internal Server Error', details: errorMessage });
    }
});
// **** END OF BLOCK TO REPLACE/UPDATE ****


// --- Other endpoints (/api/labels, /api/check-project, /api/start-project, /api/stop-project) remain the same ---
// Make sure they correctly use lowercase headers if you changed parseCsv to use lowercase
// Example: check if project lookups need .toLowerCase() if keys are now lowercase

app.get('/api/labels', (req, res) => {
    console.log("📡 GET /api/labels");
    try {
        // Use lowercase header 'label_name' consistent with parseCsv modification
        const labels = parseCsv(LABELS_CSV).map(label => ({
            id: label.label_name || `missing_label_${Math.random()}`, // Use name as ID, provide fallback
            name: label.label_name || 'Unknown Label'
        })).filter(label => label.id !== `missing_label_${Math.random()}`); // Filter out potentially invalid ones if needed
        res.json(labels);
    } catch (error) {
        console.error('❌ Error fetching labels:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});

// Check if project lookups need updating based on lowercase keys from parseCsv
// (Assuming project_name in CSV matches exactly the casing used in requests/maps)
// If parseCsv uses lowercase headers, but project_name values retain case, this is fine.
// If project_name keys in maps were lowercased, adjust lookups here:

app.post('/api/check-project', (req, res) => {
    // This endpoint uses 'port', which is likely unaffected by header casing
     console.log("📡 POST /api/check-project", req.body);
    const { port } = req.body;

    if (!port) {
        console.warn("⚠️ Port missing in check-project request");
        return res.status(400).json({ error: 'Port is required' });
    }
     const command = `lsof -i TCP:${port} -sTCP:LISTEN -P -n -t`;
     console.log(`\ud83d\udd0e Executing check: ${command}`);
     exec(command, (error, stdout, stderr) => {
         if (stdout && stdout.trim().length > 0) {
             console.log(`\ud83d\udfe2 Port ${port} is IN USE by PID(s): ${stdout.trim()}`);
             res.json({ running: true });
         } else {
             console.log(`\u26aa\ufe0f Port ${port} is free.`);
             if (error && !(stderr && stderr.includes("exit status 1"))) { // lsof exits 1 if nothing found
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
        // Find project ensuring case-insensitivity if needed, but usually match exact name
        const project = projects.find(p => p.project_name === projectName);

        if (!project) {
            console.error(`❌ Project '${projectName}' not found in CSV.`);
            return res.status(404).json({ error: `Project '${projectName}' not found.` });
        }
        // Use lowercase header name 'startup_script'
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
        const child = exec(startupScriptPath, { cwd: projectDir }, (error, stdout, stderr) => {
            if (error) { console.error(`❌ Error executing script ${startupScriptPath}: ${error}`); return; }
            console.log(`📜 [${projectName}] stdout on exit: ${stdout}`);
            console.error(`⚠️ [${projectName}] stderr on exit: ${stderr}`);
        });
        child.stdout.on('data', data => console.log(`📜 [${projectName} stdout]: ${data.toString().trim()}`));
        child.stderr.on('data', data => console.error(`⚠️ [${projectName} stderr]: ${data.toString().trim()}`));
        child.on('error', (err) => console.error(`💥 [${projectName}] Failed to start process:`, err));
        child.on('exit', code => console.log(`✅ [${projectName}] Process exited with code ${code}`));

        // Use lowercase 'port' if header changed
        res.status(202).json({ message: `Starting project ${projectName}...`, port: project.port });

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
        // Find project ensuring case-insensitivity if needed
        const project = projects.find(p => p.project_name === projectName);

        if (!project) {
            console.error(`❌ Project '${projectName}' not found in CSV for stopping.`);
            return res.status(404).json({ error: `Project '${projectName}' not found.` });
        }
        // Use lowercase 'port' if header changed
        const port = project.port;
        if (!port) {
             console.error(`❌ Project '${projectName}' has no port defined in CSV for stopping.`);
            return res.status(400).json({ error: `Port not defined for project '${projectName}'.`});
        }

        const findPidCommand = `lsof -i TCP:${port} -sTCP:LISTEN -P -n -t`;
        console.log(`\ud83d\udd0e Finding PID on port ${port} for project ${projectName}...`);

        exec(findPidCommand, (err, stdout, stderr) => {
            const pid = stdout.trim();

            if (err || !pid) {
                console.warn(`\u26a0\ufe0f No process found listening on port ${port} for ${projectName}. Maybe already stopped?`);
                if (err && !(stderr && stderr.includes("exit status 1"))) console.error(`\u26a0\ufe0f lsof error: ${err.message}`);
                if (stderr && !(stderr.includes("exit status 1"))) console.error(`\u26a0\ufe0f lsof stderr: ${stderr}`);
                return res.json({ message: `Project ${projectName} was not running or already stopped.` });
            }

            console.log(`🔪 Killing process PID ${pid} on port ${port} for project ${projectName}`);
            exec(`kill -9 ${pid}`, (killErr, killStdout, killStderr) => {
                if (killErr) {
                    console.error(`❌ Failed to kill process ${pid} for ${projectName}:`, killErr);
                    console.error(`\u26a0\ufe0f kill stderr: ${killStderr}`);
                     // Re-check if process exists
                     exec(findPidCommand, (checkErr, checkStdout, checkStderr) => {
                          if (checkStdout && checkStdout.trim().length > 0) {
                               console.error(`\u274c Process ${pid} for ${projectName} STILL RUNNING after kill attempt.`);
                               return res.status(500).json({ error: `Failed to stop project ${projectName} (Process ${pid} might still be running)` });
                          } else {
                               console.log(`\u2705 Project ${projectName} (PID ${pid}) stopped successfully despite initial kill error.`);
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
app.listen(port, HOST, () => {
    console.log(`\n🚀 Backend server listening on http://${HOST}:${port}`);
    // Display accessible IPs
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
});

// --- Basic Error Handling Middleware ---
app.use((err, req, res, next) => {
  console.error("💥 Unhandled Error:", err.stack || err);
  res.status(500).json({ error: 'Something broke!', details: err.message });
});