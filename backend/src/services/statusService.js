const { exec } = require('child_process');
const { Project } = require('../database');

let activeStatusCache = new Map();
let wss; // WebSocketServer instance will be injected

/**
 * Initializes the service with a WebSocketServer instance.
 * @param {WebSocketServer} webSocketServer The WebSocket server instance.
 */
function initialize(webSocketServer) {
    wss = webSocketServer;
    console.log('⚡ Status Service Initialized.');
    initializeStatusCache();
    setInterval(checkAllProjectsAndBroadcast, 3000);
}

function broadcast(data) {
    if (!wss) return;
    const jsonData = JSON.stringify(data);
    wss.clients.forEach(client => {
        if (client.readyState === require('ws').OPEN) {
            client.send(jsonData);
        }
    });
}

async function checkAllProjectsAndBroadcast() {
    try {
        const projects = await Project.findAll({ attributes: ['project_name', 'port'] });
        if (projects.length === 0) return;
        
        const checkPromises = projects.map(project => new Promise((resolve) => {
            const command = `ss -tln 2>/dev/null | grep -E "[^0-9]${project.port}([^0-9]|$)" | grep -w LISTEN`;
            exec(command, (err, stdout) => resolve({ projectName: project.project_name, isRunning: stdout && stdout.trim().length > 0 }));
        }));

        const results = await Promise.all(checkPromises);
        results.forEach(result => {
            const { projectName, isRunning } = result;
            if (activeStatusCache.get(projectName) !== isRunning) {
                console.log(`💡 Status changed for ${projectName}: ${isRunning ? 'UP' : 'DOWN'}. Broadcasting...`);
                broadcast({ type: 'STATUS_UPDATE', payload: { projectName, isRunning } });
                activeStatusCache.set(projectName, isRunning);
            }
        });
    } catch (error) { console.error("Error in status polling loop:", error); }
}

async function initializeStatusCache() {
    const projects = await Project.findAll({ attributes: ['project_name'] });
    projects.forEach(p => activeStatusCache.set(p.project_name, null));
    checkAllProjectsAndBroadcast();
}

module.exports = { initialize };

