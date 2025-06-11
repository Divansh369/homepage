require('dotenv').config({ path: '../.env' });
const http = require('http');
const { WebSocketServer } = require('ws');
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const bcrypt = require('bcrypt');
const { spawn, exec } = require('child_process');
const fs = require('fs');

const { sequelize, Project, Label } = require('./src/database');
const statusService = require('./src/services/statusService');
const { isAuthenticated } = require('./src/middleware/authMiddleware');

const app = express();
const server = http.createServer(app);

// --- SETUP ---
const port = process.env.BACKEND_PORT || 1024;
const HOST_TO_LISTEN = process.env.BACKEND_HOST || '0.0.0.0'; // What the server binds to
const PUBLIC_URL = process.env.BACKEND_PUBLIC_URL || `http://localhost:${port}`; // What the server advertises
const PROJECTS_BASE_PATH = process.env.PROJECTS_BASE_PATH || '/home/divansh';

// --- WebSocket Setup ---
const wss = new WebSocketServer({ server });
wss.on('connection', ws => {
    console.log('🔗 Client connected.'); ws.on('close', () => console.log('👋 Client disconnected.')); ws.on('error', console.error);
});
statusService.initialize(wss);

// --- Middleware Setup ---
const allowedOrigins = [ `http://localhost:1025`, `http://100.94.150.11:1025`, `http://localhost`, `http://100.94.150.11`, 'http://vivo', 'http://vivo:1025' ];
app.use(cors({
    origin: (origin, cb) => {
        if (!origin || allowedOrigins.some(o => origin.startsWith(o))) { return cb(null, true); }
        cb(new Error('CORS not allowed for origin: ' + origin));
    },
    credentials: true
}));
app.use(express.json());
app.use(session({
    secret: process.env.SESSION_SECRET || 'a-very-secret-and-secure-key-for-development',
    resave: false, saveUninitialized: false,
    cookie: { httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: 1000 * 60 * 60 * 24 }
}));

// --- Static Asset Serving ---
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/project_icons', express.static(PROJECTS_BASE_PATH));

// --- Multer for File Uploads ---
const UPLOADS_DIR = path.join(__dirname, 'uploads/icons');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
const upload = multer({
    storage: multer.diskStorage({
        destination: UPLOADS_DIR,
        filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
    }),
    fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith('image/'))
});

// --- API ROUTER ---
const api = express.Router();

// PUBLIC ROUTES
api.get('/auth/status', (req, res) => res.json({ isAuthenticated: !!req.session.userId }));
api.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!process.env.ADMIN_PASSWORD_HASH) return res.status(500).json({ error: "Auth not configured." });
    if (username === 'admin' && (await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH))) {
        req.session.userId = 'admin';
        return res.status(200).json({ message: 'Login successful' });
    }
    return res.status(401).json({ error: 'Invalid credentials.' });
});

api.get('/projects', async (req, res) => {
    try {
        const projects = await Project.findAll({ include: [{ model: Label, through: { attributes: [] } }], order: [['order', 'ASC']] });
        res.json(projects.map(p => {
            let iconPath = null;
            if (p.icon_filename) {
                if (p.icon_filename.startsWith('/uploads')) {
                    iconPath = `${PUBLIC_URL}${p.icon_filename}`;
                } else {
                    iconPath = `${PUBLIC_URL}/project_icons/${encodeURIComponent(p.project_name)}/${encodeURIComponent(p.icon_filename)}`;
                }
            }
            return {
                id: p.id, project_name: p.project_name, description: p.description,
                icon_filename: p.icon_filename, icon_path: iconPath, start_command: p.start_command,
                stop_command: p.stop_command, port: p.port, host: p.host, scheme: p.scheme,
                cards: p.Labels.map(l => ({ card_id: l.id, label_id: l.id, label_name: l.label_name }))
            };
        }));
    } catch (e) { res.status(500).json({error: e.message}); }
});

api.get('/project/:id', async (req, res) => {
    try {
        const project = await Project.findByPk(req.params.id, { include: [{ model: Label, attributes: ['id'], through: { attributes: [] } }] });
        if (!project) return res.status(404).json({ error: 'Project not found' });
        const projectData = project.toJSON();
        projectData.Labels = projectData.Labels.map(l => l.id);
        res.json(projectData);
    } catch (e) { res.status(500).json({error: e.message}); }
});

api.get('/labels', async (req, res) => {
    try {
        const labels = await Label.findAll({ order: [['label_type', 'ASC'], ['label_name', 'ASC']] });
        res.json(labels.map(l => ({ id: l.id, name: l.label_name, label_type: l.label_type })));
    } catch (e) { res.status(500).json({error: e.message}); }
});

api.post('/check-project', (req, res) => {
    exec(`ss -tln | grep -q ':${req.body.port} '`, (e) => res.json({ running: !e }));
});

// AUTH MIDDLEWARE
api.use(isAuthenticated);

// PROTECTED ROUTES
api.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) return res.status(500).json({error: "Logout failed."});
        res.clearCookie('connect.sid');
        res.status(200).json({ message: 'Logged out successfully' });
    });
});

api.post('/upload/icon', upload.single('icon'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file provided or file type was invalid.' });
    res.status(201).json({ filePath: `/uploads/icons/${req.file.filename}` });
});

api.post('/add-project', async (req, res) => {
    const { projectName, description, iconFilename, startCommand, stopCommand, scheme, port, host, selectedLabels = [] } = req.body;
    const transaction = await sequelize.transaction();
    try {
        const highestOrder = (await Project.max('order', { transaction })) || 0;
        const [project, created] = await Project.findOrCreate({ where: { project_name: projectName.trim() }, defaults: { description, icon_filename: iconFilename, start_command: startCommand.trim(), stop_command: stopCommand?.trim(), scheme, port: parseInt(port), host: (host?.trim() || null), order: highestOrder + 1 }, transaction });
        if (!created) { await transaction.rollback(); return res.status(409).json({ error: `Project name '${projectName}' already exists.` }); }
        if (selectedLabels.length > 0) {
            const labels = await Label.findAll({ where: { id: selectedLabels }, transaction });
            await project.setLabels(labels, { transaction });
        }
        await transaction.commit();
        res.status(201).json({ message: `Project '${projectName}' added.` });
    } catch (error) { await transaction.rollback(); res.status(500).json({ error: error.message }); }
});

api.put('/projects/:id', async (req, res) => {
    const { id } = req.params;
    const { projectName, description, iconFilename, startCommand, stopCommand, scheme, port, host, selectedLabels } = req.body;
    const transaction = await sequelize.transaction();
    try {
        const project = await Project.findByPk(id, { transaction });
        if (!project) { await transaction.rollback(); return res.status(404).json({ error: 'Project not found' }); }
        await project.update({ project_name: projectName.trim(), description, icon_filename: iconFilename, start_command: startCommand.trim(), stop_command: stopCommand?.trim(), scheme, port: parseInt(port), host: (host?.trim() || null) }, { transaction });
        if (Array.isArray(selectedLabels)) {
            const labels = await Label.findAll({ where: { id: selectedLabels }, transaction });
            await project.setLabels(labels, { transaction });
        }
        await transaction.commit();
        res.status(200).json({ message: `Project '${projectName}' updated successfully.` });
    } catch (error) { await transaction.rollback(); res.status(500).json({ error: error.message }); }
});

api.delete('/projects/:id', async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const project = await Project.findByPk(req.params.id, { transaction });
        if (!project) { await transaction.rollback(); return res.status(404).json({ error: 'Project not found' }); }
        await project.setLabels([], { transaction });
        await project.destroy({ transaction });
        await transaction.commit();
        res.status(200).json({ message: 'Project deleted successfully.' });
    } catch (error) { await transaction.rollback(); res.status(500).json({ error: error.message }); }
});

api.post('/projects/order', async (req, res) => {
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'Invalid data' });
    const transaction = await sequelize.transaction();
    try {
        await Promise.all(orderedIds.map((id, index) => Project.update({ order: index + 1 }, { where: { id }, transaction })));
        await transaction.commit();
        res.status(200).json({ message: 'Project order saved successfully.' });
    } catch (error) { await transaction.rollback(); res.status(500).json({ error: error.message }); }
});

api.post('/start-project', async (req, res) => {
    const { projectName } = req.body;
    try {
        const project = await Project.findOne({ where: { project_name: projectName } });
        if (!project) return res.status(404).json({ error: `Project '${projectName}' not found.` });
        const projectDir = path.join(PROJECTS_BASE_PATH, project.project_name);
        if (!fs.existsSync(projectDir)) return res.status(404).json({ error: `Project directory not found.` });
        const logsDir = path.resolve(__dirname, 'logs');
        if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
        const logFilePath = path.join(logsDir, `${projectName}.log`);
        const out = fs.openSync(logFilePath, 'a');
        const err = fs.openSync(logFilePath, 'a');
        const child = spawn(project.start_command, [], { cwd: projectDir, detached: true, stdio: ['ignore', out, err], shell: true });
        child.on('error', console.error);
        child.unref();
        res.status(202).json({ message: `Start initiated for '${projectName}'.` });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

api.post('/stop-project', async (req, res) => {
    const { projectName } = req.body;
    try {
        const project = await Project.findOne({ where: { project_name: projectName } });
        if (!project) return res.status(404).json({ error: `Project '${projectName}' not found.` });
        if (!project.stop_command) return res.status(400).json({ error: 'No stop command defined.' });
        const projectDir = path.join(PROJECTS_BASE_PATH, project.project_name);
        exec(project.stop_command, { cwd: fs.existsSync(projectDir) ? projectDir : __dirname }, (error) => {
            if (error) return res.status(500).json({ message: 'Error stopping project.', error: error.message });
            res.json({ message: 'Stop command executed.' });
        });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

api.post('/add-label', async (req, res) => {
    const { name, type } = req.body;
    if (!name?.trim() || !type) return res.status(400).json({ error: 'Name and type are required.' });
    try {
        const [label, created] = await Label.findOrCreate({ where: { label_name: name.trim() }, defaults: { label_type: type } });
        if (!created) return res.status(409).json({ error: `Label '${name}' already exists.` });
        res.status(201).json({ message: `Label '${name}' added.`, label });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

api.put('/labels/:id', async (req, res) => {
    const { id } = req.params;
    const { name, type } = req.body;
    if (!name?.trim() || !type) return res.status(400).json({ error: 'Name and type are required.' });
    try {
        const label = await Label.findByPk(id);
        if (!label) return res.status(404).json({ error: 'Label not found' });
        await label.update({ label_name: name.trim(), label_type: type });
        res.status(200).json({ message: 'Label updated successfully.', label });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

api.delete('/labels/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const label = await Label.findByPk(id);
        if (label) {
            await label.setProjects([]); // Clear associations
            await label.destroy();
        }
        res.status(200).json({ message: 'Label deleted.' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// Final Mounting
app.use('/api', api);
app.use((err, req, res, next) => {
    console.error("FATAL ERROR", err);
    res.status(500).send('An unexpected error occurred!');
});

// Start Server
async function start() {
    try {
        await sequelize.authenticate();
        console.log('Database connected.');
        await sequelize.sync();
        console.log('Models synchronized.');
        server.listen(port, HOST_TO_LISTEN, () => { // <-- Use HOST_TO_LISTEN
            console.log(`🚀 Server ready at http://${HOST_TO_LISTEN}:${port}`);
        });
    } catch (error) {
        console.error('💥 Server startup failed:', error);
        process.exit(1);
    }
}

start();
