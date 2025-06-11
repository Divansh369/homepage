// backend/scripts/migrate-csv-to-db.js
const path = require('path');
const { sequelize, Project, Label, ProjectLabels } = require('../src/database');
const { parseCsv } = require('../src/csvParser');

const PROJECTS_CSV = path.join(__dirname, '..', 'projects.csv');
const LABELS_CSV = path.join(__dirname, '..', 'labels.csv');
const PROJECT_LABELS_CSV = path.join(__dirname, '..', 'project_labels.csv');

async function migrate() {
    console.log('🚀 Starting database migration...');
    try {
        await sequelize.sync({ force: true });
        console.log('   >> 🔄 Database synced! All tables dropped and recreated.');

        // 1. Migrate Labels
        console.log('\n--- Step 1: Migrating Labels ---');
        const labelData = parseCsv(LABELS_CSV);
        await Label.bulkCreate(labelData.map(l => ({
            label_name: l.label_name, label_type: l.label_type
        })), { validate: true });
        console.log(`✅ Labels migration complete. Found ${labelData.length} labels in CSV.`);
        
        // 2. Migrate Projects
        console.log('\n--- Step 2: Migrating Projects ---');
        const projectData = parseCsv(PROJECTS_CSV);
        for (const [index, p] of projectData.entries()) {
            const portNumber = p.port ? parseInt(p.port.trim(), 10) : NaN;
            if (!p.project_name || !p.startup_script || isNaN(portNumber)) {
                console.warn(`⚠️ Skipping invalid project row: ${JSON.stringify(p)}`);
                continue;
            }
            await Project.create({
                project_name: p.project_name.trim(), description: p.description,
                icon_filename: p.icon_filename, start_command: p.startup_script.trim(),
                stop_command: '', scheme: (p.scheme || 'http').trim(), port: portNumber,
                host: (p.host || '').trim(), order: index + 1,
            });
        }
        console.log(`✅ Projects migration complete. Found ${projectData.length} projects in CSV.`);

        // 3. --- FIX: Await database reads before trying to link ---
        console.log('\n--- Step 3: Linking Projects and Labels ---');
        // VERY IMPORTANT: Read the now-committed data back from the DB
        const allProjects = await Project.findAll();
        const allLabels = await Label.findAll();
        console.log(`   >> Fetched ${allProjects.length} projects and ${allLabels.length} labels from database for linking.`);
        
        // Create maps for quick lookups by name -> ID
        const projectsMap = new Map(allProjects.map(p => [p.project_name.toLowerCase(), p.id]));
        const labelsMap = new Map(allLabels.map(l => [l.label_name.toLowerCase(), l.id]));

        const projectLabelData = parseCsv(PROJECT_LABELS_CSV);
        console.log(`   >> Found ${projectLabelData.length} potential associations in project_labels.csv.`);
        
        const associationsToCreate = [];
        for (const pl of projectLabelData) {
            if (!pl.project_name || !pl.label_name) continue;
            
            const projectId = projectsMap.get(pl.project_name.trim().toLowerCase());
            const labelId = labelsMap.get(pl.label_name.trim().toLowerCase());

            if (projectId && labelId) {
                associationsToCreate.push({
                    ProjectId: projectId,
                    LabelId: labelId,
                });
            } else {
                if (!projectId) console.warn(`   - Skipping link: Project "${pl.project_name}" not found in DB.`);
                if (!labelId) console.warn(`   - Skipping link: Label "${pl.label_name}" not found in DB.`);
            }
        }
        
        console.log(`   >> Prepared ${associationsToCreate.length} valid associations for creation.`);
        
        // Bulk insert all associations in one go for efficiency.
        if (associationsToCreate.length > 0) {
             await ProjectLabels.bulkCreate(associationsToCreate);
             console.log(`✅ Associations created successfully.`);
        } else {
            console.log('   >> No valid associations were found to create.');
        }

    } catch (error) {
        console.error('💥 Migration failed:', error);
        process.exit(1);
    } finally {
        await sequelize.close();
        console.log('\n🏁 Migration complete. Database connection closed.');
    }
}

migrate();
