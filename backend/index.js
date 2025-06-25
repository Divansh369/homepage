// BACKEND (./backend/index.js) - COMPLETE FILE with debugging logs
require('dotenv').config({ path: '../.env' });
const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');
const multer = require('multer');

const app = express();
const port = process.env.BACKEND_PORT || 1024;
const HOST = process.env.BACKEND_HOST || '0.0.0.0';
const PROJECT_DEFAULT_HOST = process.env.PROJECT_DEFAULT_HOST || '';

const envAllowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()) : [];
const defaultAllowedOrigins = [
    `http://${PROJECT_DEFAULT_HOST}:1025`, `http://localhost:1025`, `http://100.94.150.11:1025`,
    `http://${PROJECT_DEFAULT_HOST}`, `http://localhost`, `http://100.94.150.11`, 'http://vivo' ,'http://vivo:1025'
];
const combinedAllowedOrigins = [...new Set([...defaultAllowedOrigins, ...envAllowedOrigins])];

const corsOptions = {
    origin: function (origin, callback) {
        if (!origin || combinedAllowedOrigins.some(allowed => origin.startsWith(allowed))) {
             return callback(null, true);
         }
        console.warn(`CORS blocked for origin: ${origin}. Allowed: ${combinedAllowedOrigins.join(', ')}`);
        return callback(new Error('CORS policy violation'), false);
    },
    credentials: true, methods: 'GET,POST,PUT,DELETE,OPTIONS', allowedHeaders: 'Content-Type,Authorization',
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());

console.log("\ud83d\udd27 Backend starting...");
console.log(`   >> Default Project Host: ${PROJECT_DEFAULT_HOST}`);
console.log(`   >> Backend Listening on: http://${HOST}:${port}`);

const PROJECTS_CSV = path.join(__dirname, 'projects.csv');
const LABELS_CSV = path.join(__dirname, 'labels.csv');
const PROJECT_LABELS_CSV = path.join(__dirname, 'project_labels.csv');
const UPLOAD_TEMP_DIR = path.join(__dirname, 'uploads_temp');
const LOGS_DIR = path.join(__dirname, 'logs');
const PROJECTS_BASE_PATH = process.env.PROJECTS_ACTUAL_BASE_PATH || '/home/divansh';
const PROJECTS_ICONS_FRONTEND_PATH = path.resolve(__dirname, '..', 'frontend', 'public', 'projects');
const LABEL_ICONS_FRONTEND_PATH = path.resolve(__dirname, '..', 'frontend', 'public', 'label_icons');

const PROJECT_CSV_HEADERS = ['project_name', 'description', 'icon_filename', 'startup_script', 'scheme', 'port', 'host'];
const LABEL_CSV_HEADERS = ['label_name', 'label_type'];
const PROJECT_LABEL_CSV_HEADERS = ['project_name', 'label_name'];

[UPLOAD_TEMP_DIR, LOGS_DIR, PROJECTS_ICONS_FRONTEND_PATH, LABEL_ICONS_FRONTEND_PATH].forEach(dir => {
    if (!fsSync.existsSync(dir)) { try { fsSync.mkdirSync(dir, { recursive: true }); console.log(`Created dir: ${dir}`); } catch (err) { console.error(`Failed to create dir ${dir}:`, err); }}
});

const storage = multer.diskStorage({
    destination: function (req, file, cb) { cb(null, UPLOAD_TEMP_DIR); },
    filename: function (req, file, cb) { cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '')); }
});
const upload = multer({ storage: storage });

function parseCsv(filePath, expectedHeaders = []) {
    try {
        if (!fsSync.existsSync(filePath)) {
            console.warn(`⚠️ CSV file not found: ${filePath}.`);
            if (expectedHeaders.length > 0) { console.log(`Creating ${filePath} with headers: ${expectedHeaders.join(',')}`); fsSync.writeFileSync(filePath, expectedHeaders.join(',') + '\n', 'utf8'); }
            return [];
        }
        const data = fsSync.readFileSync(filePath, 'utf8').trim();
        if (!data) { if (expectedHeaders.length > 0 && !fsSync.readFileSync(filePath, 'utf8').includes(expectedHeaders[0])) { console.warn(`CSV ${filePath} empty/missing headers. Writing headers.`); fsSync.writeFileSync(filePath, expectedHeaders.join(',') + '\n', 'utf8'); } return []; }
        const lines = data.split('\n'); if (lines.length === 0) return [];
        let headersLine = lines[0];
        if (!headersLine.trim() && expectedHeaders.length > 0) { headersLine = expectedHeaders.join(','); } else if (!headersLine.trim()) { return []; }
        const headers = headersLine.split(',').map(header => header.trim().toLowerCase());
        const dataStartIndex = (lines[0].toLowerCase().includes(headers[0]) && headers.length > 0) ? 1 : 0;
        return lines.slice(dataStartIndex).map(line => {
            if (!line.trim()) return null; const values = []; let currentVal = ''; let inQuotes = false;
            for (let i = 0; i < line.length; i++) { const char = line[i]; if (char === '"') { if (inQuotes && line[i+1]==='"') {currentVal+='"';i++;} else {inQuotes=!inQuotes;} } else if (char===','&&!inQuotes) {values.push(currentVal.trim());currentVal='';} else {currentVal+=char;} }
            values.push(currentVal.trim());
            if(values.length !== headers.length && headers.length > 0){ const correctedValues = new Array(headers.length).fill(''); for(let i=0; i < headers.length; i++){ if(values[i]!==undefined) correctedValues[i]=values[i];} return headers.reduce((obj,h,idx)=>{obj[h]=correctedValues[idx]||'';return obj;},{}); }
            else if (headers.length === 0 && values.length > 0) { return { column1: values[0] }; } 
            else if (headers.length === 0 && values.length === 0) { return null; } 
            return headers.reduce((obj,h,idx)=>{obj[h]=values[idx]||'';return obj;},{});
        }).filter(item=>item!==null && Object.values(item).some(val=>String(val).trim()!==''));
    } catch (error) { console.error(`❌ Error parsing CSV ${filePath}:`, error); return []; }
}

function escapeCsvField(field) {
    if (field === null || typeof field === 'undefined') return '';
    const stringField = String(field);
    if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) return `"${stringField.replace(/"/g, '""')}"`;
    return stringField;
}

async function writeCsv(filePath, data, headersToUse) {
    try { const headerRow = headersToUse.join(','); const dataRows = data.map(row => headersToUse.map(hK=>escapeCsvField(row[hK.toLowerCase()]??row[hK]??'')).join(','));
        const csvContent = [headerRow, ...dataRows].join('\n')+(dataRows.length>0?'\n':'\n'); await fs.writeFile(filePath,csvContent,'utf8'); console.log(`✅ CSV ${path.basename(filePath)} written. Rows: ${data.length}`); }
    catch(e){console.error(`❌ Write CSV ${filePath}:`,e);throw e;}
}

app.get('/api/projects', (req, res) => {
    console.log("📡 GET /api/projects");
    try {
        const projectsFromCsv = parseCsv(PROJECTS_CSV, PROJECT_CSV_HEADERS);
        const allLabels = parseCsv(LABELS_CSV, LABEL_CSV_HEADERS);
        const projectLabelLinks = parseCsv(PROJECT_LABELS_CSV, PROJECT_LABEL_CSV_HEADERS);

        const labelsMap = allLabels.reduce((acc, label) => { if (label.label_name) acc[label.label_name.toLowerCase()] = label; return acc; }, {});
        const projectLabelsMap = projectLabelLinks.reduce((acc, pl) => {
            if (pl.project_name && pl.label_name) { const key = pl.project_name; if (!acc[key]) acc[key] = []; acc[key].push(pl.label_name.toLowerCase()); } return acc;
        }, {});
        
        const combinedData = projectsFromCsv.map(project => {
            if (!project.project_name) { return null; }
            const associatedLabelNames = projectLabelsMap[project.project_name] || []; // Match original case from projects.csv for linking
            const projectLinkedLabels = associatedLabelNames.map(labelNameLower => {
                const labelInfo = labelsMap[labelNameLower];
                return labelInfo ? { label_id: labelInfo.label_name, label_name: labelInfo.label_name, label_type: labelInfo.label_type } : null;
            }).filter(Boolean);
            const scheme = (String(project.scheme)?.toLowerCase() === 'https') ? 'https' : 'http';
            const host = project.host || PROJECT_DEFAULT_HOST;
            const iconPath = project.icon_filename ? `/projects/${encodeURIComponent(project.project_name)}/${encodeURIComponent(project.icon_filename)}` : '/label_icons/default.png';
            return { ...project, project_name: project.project_name, description: project.description || '', icon_filename: project.icon_filename || '', startup_script: project.startup_script || 'homepage/start.sh', scheme, port: project.port || '', host, iconPath, labels: projectLinkedLabels || [] };
        }).filter(Boolean);
        
        // DEBUG LOG for labels on main page
        const projectToCheck = combinedData.find(p => p.project_name === 'beszel'); // Change 'beszel' if needed
        if(projectToCheck) console.log("DEBUG /api/projects - 'beszel' project data:", JSON.stringify(projectToCheck, null, 2));
        else console.log("DEBUG /api/projects - 'beszel' not found in combinedData");

        res.json(combinedData);
    } catch (error) { console.error('❌ GET /api/projects error:', error); res.status(500).json({ error: 'Internal Server Error', details: error.message }); }
});

app.get('/api/project/:projectNameParam', (req, res) => {
    const projectNameDecoded = req.params.projectNameParam; // Express decodes this
    console.log(`📡 GET /api/project/ with param: '${projectNameDecoded}'`);
    try {
        const projects = parseCsv(PROJECTS_CSV, PROJECT_CSV_HEADERS);
        // Crucial: Match case exactly as it is in the CSV file's project_name column.
        const project = projects.find(p => String(p.project_name).trim() === String(projectNameDecoded).trim());

        if (!project) {
            console.warn(`Project '${projectNameDecoded}' not found in CSV during /api/project lookup. Available projects: ${projects.map(p=>`'${p.project_name}'`).join(', ')}`);
            return res.status(404).json({ error: `Project '${projectNameDecoded}' not found.` });
        }

        const allLabels = parseCsv(LABELS_CSV, LABEL_CSV_HEADERS);
        const projectLabelLinks = parseCsv(PROJECT_LABELS_CSV, PROJECT_LABEL_CSV_HEADERS);
        const labelsMap = allLabels.reduce((acc, label) => { if (label.label_name) acc[label.label_name.toLowerCase()] = label; return acc; }, {});
        const associatedLabelNames = projectLabelLinks.filter(pl => pl.project_name === project.project_name).map(pl => pl.label_name.toLowerCase());
        const projectLinkedLabels = associatedLabelNames.map(name => labelsMap[name]).filter(Boolean).map(l => ({label_id: l.label_name, label_name: l.label_name, label_type: l.label_type}));
        
        const scheme = (String(project.scheme)?.toLowerCase() === 'https') ? 'https' : 'http';
        const host = project.host || PROJECT_DEFAULT_HOST;
        const iconPathDefined = project.icon_filename ? `/projects/${encodeURIComponent(project.project_name)}/${encodeURIComponent(project.icon_filename)}` : '/label_icons/default.png';

        res.json({ ...project, description: project.description || '', scheme, host, iconPath: iconPathDefined, labels: projectLinkedLabels || [] });
    } catch (error) { console.error(`❌ GET /api/project/${projectNameDecoded} error:`, error); res.status(500).json({ error: 'Internal Server Error', details: error.message }); }
});

// ... (rest of the API endpoints: /api/labels, check-project, start, stop, add-label, add-project, update-project are same as your "File 1 of 3") ...
// Make sure they use the updated parseCsv and writeCsv definitions.

app.get('/api/labels', (req, res) => {
    console.log("📡 GET /api/labels");
    try { res.json(parseCsv(LABELS_CSV, LABEL_CSV_HEADERS).map(l => ({ id: l.label_name, name: l.label_name, label_type: l.label_type })).filter(l => l.id && l.name && l.label_type)); }
    catch (e) { console.error('❌ GET /api/labels error:', e); res.status(500).json({ error: 'Failed to fetch labels' }); }
});

app.post('/api/check-project', (req, res) => {
    const { port } = req.body; if (!port || isNaN(parseInt(port))) return res.status(400).json({ error: 'Valid port is required' });
    exec(`ss -tlnp 2>/dev/null | grep -E ":${port}\\s" | grep -w LISTEN`, (e, stdout) => res.json({ running: !!(stdout && stdout.trim())}));
});

app.post('/api/start-project', async (req, res) => {
    const { projectName } = req.body; if (!projectName) return res.status(400).json({ error: 'Project name required.' });
    console.log(`📡 POST /api/start-project for '${projectName}'`);
    try { const p = parseCsv(PROJECTS_CSV, PROJECT_CSV_HEADERS).find(pr=>pr.project_name===projectName); if(!p)return res.status(404).json({error:`Project '${projectName}' not found for start.`});
        const scriptRelativePath = p.startup_script || 'homepage/start.sh';
        const scriptAbsPath = path.join(PROJECTS_BASE_PATH, p.project_name, scriptRelativePath);
        const projectDir = path.join(PROJECTS_BASE_PATH, p.project_name);

        if(!fsSync.existsSync(projectDir)) { console.error(`Project directory ${projectDir} not found.`); return res.status(404).json({error: `Directory for project '${projectName}' not found.`}); }
        if(!fsSync.existsSync(scriptAbsPath)) { console.error(`Startup script ${scriptAbsPath} not found.`); return res.status(404).json({error:`Startup script '${scriptRelativePath}' for project '${projectName}' not found.`}); }
        
        const logFilePath = path.join(LOGS_DIR,`${projectName}.log`);
        const logStream = fsSync.openSync(logFilePath,'a');
        console.log(`🚀 Spawning: ${scriptAbsPath} in CWD: ${projectDir} > ${logFilePath}`);
        spawn(scriptAbsPath, [], {cwd: projectDir, detached:true, stdio:['ignore', logStream, logStream], shell:true}).unref();
        res.status(202).json({message:`Start initiated for ${projectName}.`, port:p.port});
    } catch(e){ console.error(`❌ Error starting project ${projectName}:`, e); res.status(500).json({error:'Server error starting project.',details:e.message});}
});

app.post('/api/stop-project', async (req, res) => {
    const { projectName } = req.body; if (!projectName) return res.status(400).json({ error: 'Project name required.' });
    console.log(`📡 POST /api/stop-project for '${projectName}'`);
    try { const p = parseCsv(PROJECTS_CSV, PROJECT_CSV_HEADERS).find(pr=>pr.project_name===projectName); if(!p)return res.status(404).json({error:`Project '${projectName}' not found for stop.`});
        const scriptAbsPath=path.join(PROJECTS_BASE_PATH,p.project_name,'homepage/stop.sh');
        const projectDir = path.join(PROJECTS_BASE_PATH, p.project_name);

        if(fsSync.existsSync(scriptAbsPath)){
            if(!fsSync.existsSync(projectDir)) { console.error(`Project directory ${projectDir} not found for stop script.`); return res.status(404).json({error: `Directory for project '${projectName}' for stop script not found.`}); }
            const logFilePath=path.join(LOGS_DIR,`${projectName}_stop.log`);
            const logStream=fsSync.openSync(logFilePath,'a');
            console.log(`🔌 Stopping with script: ${scriptAbsPath} in CWD: ${projectDir} > ${logFilePath}`);
            spawn(scriptAbsPath,[],{cwd:projectDir,detached:true,stdio:['ignore',logStream,logStream],shell:true}).on('exit',c=>res.json({message:`Stop script for ${projectName} exited with code ${c}.`})).unref();
        } else {
            console.warn(`\u26A0\uFE0F Stop script ${scriptAbsPath} not found. Falling back to PID kill via port ${p.port}.`);
            const port=p.port; if(!port||isNaN(parseInt(port)))return res.status(400).json({error:'No valid port defined for PID kill and no stop script.'});
            exec(`ss -tlnp 2>/dev/null|grep ":${port}\\s"|awk '{print $NF}'|grep -oP 'pid=\\K\\d+'`,(err,pidS)=>{
                if(err && err.code !== 1){ console.error(`Error finding PID for port ${port}:`, err); return res.status(500).json({error: 'Error finding PID.'});}
                const pid=pidS.trim().split('\n')[0];
                if(!pid){ console.log(`No process found on port ${port} for project ${projectName}.`); return res.json({message:`${projectName} (port ${port}) not running or PID not found for fallback kill.`});}
                console.log(`Attempting to kill PID ${pid} for project ${projectName} on port ${port}.`);
                exec(`kill -9 ${pid}`,(killErr)=>res.json({message: killErr?`Fallback kill for PID ${pid} failed: ${killErr.message}`:`${projectName} (PID ${pid}) stopped via fallback kill.`}));
            });
        }
    } catch(e){ console.error(`❌ Error stopping project ${projectName}:`, e); res.status(500).json({error:'Server error stopping project.',details:e.message});}
});

app.post('/api/add-label', upload.single('icon'), async (req, res) => {
    const { name, type } = req.body; const iconFile = req.file; if (!name?.trim() || !type || !['language','utility'].includes(type)) return res.status(400).json({ error: 'Label name and valid type (language/utility) required.' });
    const trimmedName = name.trim(); console.log(`📡 POST /api/add-label: '${trimmedName}', type: '${type}'`);
    try {
        const labels = parseCsv(LABELS_CSV, LABEL_CSV_HEADERS); if (labels.some(l=>l.label_name.toLowerCase()===trimmedName.toLowerCase())) {if(iconFile)await fs.unlink(iconFile.path); return res.status(409).json({error:`Label '${trimmedName}' already exists.`});}
        let finalIconName = ''; if(iconFile){finalIconName = `${trimmedName.replace(/[^a-zA-Z0-9.-]/g,'_')}${path.extname(iconFile.originalname)||'.png'}`; await fs.rename(iconFile.path, path.join(LABEL_ICONS_FRONTEND_PATH, finalIconName)); console.log(`🖼️ Label icon '${finalIconName}' saved.`);}
        labels.push({label_name:trimmedName, label_type:type}); await writeCsv(LABELS_CSV, labels, LABEL_CSV_HEADERS);
        res.status(201).json({message:`Label '${trimmedName}' added.`, icon:finalIconName});
    }catch(e){console.error(`❌ Error adding label '${trimmedName}':`, e); if(iconFile&&fsSync.existsSync(iconFile.path))await fs.unlink(iconFile.path).catch(console.warn); res.status(500).json({error:'Failed to add label.'});}
});

app.post('/api/add-project', upload.single('icon'), async (req, res) => {
    const {projectName,description='',startupScriptCommand,stopScriptCommand,scheme='http',port,host,selectedLabelsJson} = req.body;
    const iconFile=req.file; let selLabels=[]; try{if(selectedLabelsJson)selLabels=JSON.parse(selectedLabelsJson);}catch(e){return res.status(400).json({error:'Invalid selectedLabels JSON.'});}
    if(!projectName?.trim()||!port||isNaN(parseInt(port)))return res.status(400).json({error:'Project Name and valid Port are required.'});
    const trimName=projectName.trim().replace(/\s+/g,'_'); let upIconName=req.body.iconFilename?.trim()||''; // Allows providing filename if not uploading
    console.log(`📡 POST /api/add-project: '${trimName}'`);
    try {
        const projects=parseCsv(PROJECTS_CSV,PROJECT_CSV_HEADERS); if(projects.some(p=>p.project_name.toLowerCase()===trimName.toLowerCase())){if(iconFile)await fs.unlink(iconFile.path);return res.status(409).json({error:`Project name '${trimName}' already exists.`});}
        if(iconFile){const pIconDir=path.join(PROJECTS_ICONS_FRONTEND_PATH,trimName);await fs.mkdir(pIconDir,{recursive:true});upIconName=iconFile.originalname.replace(/\s+/g,'_').replace(/[^a-zA-Z0-9._-]/g, '');await fs.rename(iconFile.path,path.join(pIconDir,upIconName)); console.log(`🖼️ Project icon '${upIconName}' saved.`);}
        const pHomeDir=path.join(PROJECTS_BASE_PATH,trimName,'homepage');await fs.mkdir(pHomeDir,{recursive:true});
        await fs.writeFile(path.join(pHomeDir,'start.sh'),`#!/bin/bash\n${startupScriptCommand||'echo "Start script not configured"\nexit 1'}\n`,{mode:0o755});
        await fs.writeFile(path.join(pHomeDir,'stop.sh'),`#!/bin/bash\n${stopScriptCommand||'echo "Stop script not configured"\nexit 0'}\n`,{mode:0o755});
        console.log(`🛠️ Scripts created for ${trimName}.`);
        const newP={project_name:trimName,description,icon_filename:upIconName,startup_script:'homepage/start.sh',scheme:(scheme==='https'?'https':'http'),port:String(port).trim(),host:host?.trim()||PROJECT_DEFAULT_HOST};
        projects.push(newP);await writeCsv(PROJECTS_CSV,projects,PROJECT_CSV_HEADERS);
        if(selLabels.length){const pLabels=parseCsv(PROJECT_LABELS_CSV,PROJECT_LABEL_CSV_HEADERS);selLabels.forEach(lN=>{if(typeof lN==='string'&&lN.trim())pLabels.push({project_name:trimName,label_name:lN.trim()});});await writeCsv(PROJECT_LABELS_CSV,pLabels,PROJECT_LABEL_CSV_HEADERS);}
        res.status(201).json({message:`Project '${trimName}' added successfully.`,project:newP});
    }catch(e){console.error(`❌ Error adding project '${trimName}':`, e); if(iconFile&&fsSync.existsSync(iconFile.path))await fs.unlink(iconFile.path).catch(console.warn);res.status(500).json({error:'Failed to add project data.'});}
});

app.put('/api/project/:projectNameParam', upload.single('newIcon'), async (req, res) => {
    const oldName=req.params.projectNameParam; const{projectName,description,iconFilename,startupScriptCommand,stopScriptCommand,scheme,port,host,selectedLabelsJson}=req.body;
    const newIconFile=req.file; let selLabels=[];try{if(selectedLabelsJson)selLabels=JSON.parse(selectedLabelsJson);}catch(e){return res.status(400).json({error:'Invalid selectedLabels JSON.'});}
    if(!projectName?.trim())return res.status(400).json({error:'Project name required.'});
    console.log(`📡 PUT /api/project/${oldName} to ${projectName}`);
    try {
        let projects=parseCsv(PROJECTS_CSV,PROJECT_CSV_HEADERS);const idx=projects.findIndex(p=>String(p.project_name).trim()===String(oldName).trim());
        if(idx===-1){if(newIconFile)await fs.unlink(newIconFile.path);return res.status(404).json({error:`Project '${oldName}' not found to update.`});}
        const updatedProjectData={...projects[idx]}; // Keep existing fields
        updatedProjectData.project_name=projectName.trim().replace(/\s+/g,'_'); // Update name
        updatedProjectData.description=description || updatedProjectData.description;
        updatedProjectData.scheme=scheme==='https'?'https':'http';
        updatedProjectData.port=String(port).trim() || updatedProjectData.port;
        updatedProjectData.host=host?.trim() || updatedProjectData.host || PROJECT_DEFAULT_HOST;

        if(newIconFile){const pIconDir=path.join(PROJECTS_ICONS_FRONTEND_PATH,updatedProjectData.project_name);await fs.mkdir(pIconDir,{recursive:true});const newFName=newIconFile.originalname.replace(/\s+/g,'_').replace(/[^a-zA-Z0-9._-]/g, '');await fs.rename(newIconFile.path,path.join(pIconDir,newFName));updatedProjectData.icon_filename=newFName; console.log(`🖼️ Icon updated for ${updatedProjectData.project_name} to ${newFName}`);}
        else if(iconFilename !== undefined){updatedProjectData.icon_filename=iconFilename.trim();} // Update filename text if provided, even without new file

        const pHomeDir=path.join(PROJECTS_BASE_PATH,updatedProjectData.project_name,'homepage');await fs.mkdir(pHomeDir,{recursive:true});
        if(startupScriptCommand !== undefined) { await fs.writeFile(path.join(pHomeDir,'start.sh'),`#!/bin/bash\n${startupScriptCommand}\n`,{mode:0o755}); console.log(`🛠️ start.sh updated for ${updatedProjectData.project_name}`);}
        updatedProjectData.startup_script='homepage/start.sh'; // Always set to standard if editing scripts
        if(stopScriptCommand !== undefined) { await fs.writeFile(path.join(pHomeDir,'stop.sh'),`#!/bin/bash\n${stopScriptCommand}\n`,{mode:0o755}); console.log(`🛠️ stop.sh updated for ${updatedProjectData.project_name}`);}
        
        projects[idx]=updatedProjectData;await writeCsv(PROJECTS_CSV,projects,PROJECT_CSV_HEADERS);
        
        let pLabels=parseCsv(PROJECT_LABELS_CSV,PROJECT_LABEL_CSV_HEADERS);
        pLabels=pLabels.filter(pl=>pl.project_name!==oldName && pl.project_name!==updatedProjectData.project_name); // Remove all old and new name associations first
        (selLabels||[]).forEach(lN=>{if(typeof lN==='string'&&lN.trim())pLabels.push({project_name:updatedProjectData.project_name,label_name:lN.trim()});});
        await writeCsv(PROJECT_LABELS_CSV,pLabels,PROJECT_LABEL_CSV_HEADERS);
        
        const finalIconPath = updatedProjectData.icon_filename ? `/projects/${encodeURIComponent(updatedProjectData.project_name)}/${encodeURIComponent(updatedProjectData.icon_filename)}` : '/label_icons/default.png';
        res.json({message:`Project '${oldName}' updated to '${updatedProjectData.project_name}'.`,project:{...updatedProjectData, iconPath: finalIconPath}});
    }catch(e){console.error(`❌ Error updating project '${oldName}':`, e); if(newIconFile&&fsSync.existsSync(newIconFile.path))await fs.unlink(newIconFile.path).catch(console.warn);res.status(500).json({error:'Failed to update project.'});}
});

app.post('/api/projects/order', async (req, res) => {
    console.log("📡 POST /api/projects/order - Received body:", req.body); // DEBUG
    const { orderedProjectNames } = req.body;
    if (!Array.isArray(orderedProjectNames) || !orderedProjectNames.every(item => typeof item === 'string')) {
        console.error("Invalid project order data:", orderedProjectNames);
        return res.status(400).json({ error: 'Invalid project order data. Expected an array of project name strings.' });
    }
    try {
        const existingProjects = parseCsv(PROJECTS_CSV, PROJECT_CSV_HEADERS);
        const existingProjectsMap = existingProjects.reduce((map, proj) => { if (proj.project_name) map[proj.project_name] = proj; return map; }, {});
        const reorderedProjects = orderedProjectNames.map(projectName => existingProjectsMap[projectName]).filter(Boolean);
        existingProjects.forEach(proj => { if (proj.project_name && !orderedProjectNames.includes(proj.project_name)) reorderedProjects.push(proj); });
        await writeCsv(PROJECTS_CSV, reorderedProjects, PROJECT_CSV_HEADERS);
        console.log(`✅ Project order saved. Total projects in CSV: ${reorderedProjects.length}`);
        res.status(200).json({ message: 'Project order saved successfully.' });
    } catch (error) { console.error(`❌ Error saving project order:`, error); res.status(500).json({ error: 'Internal Server Error', details: 'Failed to save project order.' }); }
});

app.post('/api/project/:projectName/migrate-scripts', async (req, res) => {
    const { projectName } = req.params; const { startCommand, stopCommand } = req.body; if (!startCommand || !stopCommand) return res.status(400).json({ error: 'Start and Stop commands are required.' });
    console.log(`📡 POST /api/project/${projectName}/migrate-scripts`);
    try {
        let projects = parseCsv(PROJECTS_CSV, PROJECT_CSV_HEADERS); const idx = projects.findIndex(p => p.project_name === projectName); if (idx === -1) return res.status(404).json({ error: `Project '${projectName}' not found.` });
        const pHomeDir = path.join(PROJECTS_BASE_PATH, projects[idx].project_name, 'homepage'); await fs.mkdir(pHomeDir, { recursive: true });
        await fs.writeFile(path.join(pHomeDir, 'start.sh'), `#!/bin/bash\n${startCommand}\n`, { mode: 0o755 });
        await fs.writeFile(path.join(pHomeDir, 'stop.sh'), `#!/bin/bash\n${stopCommand}\n`, { mode: 0o755 });
        projects[idx].startup_script = 'homepage/start.sh'; await writeCsv(PROJECTS_CSV, projects, PROJECT_CSV_HEADERS);
        console.log(`✅ Scripts migrated for ${projectName}.`);
        res.status(200).json({ message: `Scripts for '${projectName}' migrated successfully.` });
    } catch (error) { console.error(`❌ Error migrating scripts for '${projectName}':`, error); res.status(500).json({ error: 'Failed to migrate scripts.' }); }
});

app.listen(port, HOST, () => console.log(`\n🚀 Backend server ready on http://${HOST}:${port}`));
app.use((err, req, res, next) => { console.error("💥 Unhandled Error:", err.stack||err); if(!res.headersSent)res.status(err.status||500).json({error:err.message||'Internal Server Error!', details: process.env.NODE_ENV === 'development' ? err.message : undefined});});
