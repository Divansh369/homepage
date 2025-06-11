// backend/src/database.js

const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');

const storagePath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'database.sqlite');
console.log(`🗃️  Database storage path: ${storagePath}`);

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: storagePath,
  logging: false,
});

const Project = sequelize.define('Project', {
    project_name: { type: DataTypes.STRING, allowNull: false, unique: true },
    description: { type: DataTypes.TEXT },
    icon_filename: { type: DataTypes.STRING },
    start_command: { type: DataTypes.STRING, allowNull: false },
    stop_command: { type: DataTypes.STRING },
    scheme: { type: DataTypes.STRING, defaultValue: 'http' },
    port: { type: DataTypes.INTEGER, allowNull: false },
    host: { type: DataTypes.STRING },
    order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
}, { timestamps: true });

const Label = sequelize.define('Label', {
    label_name: { type: DataTypes.STRING, allowNull: false, unique: true },
    label_type: { type: DataTypes.STRING, allowNull: false },
    icon_filename: { type: DataTypes.STRING },
}, { timestamps: false });

// --- FIX: Define the through model explicitly for a correct M:N relationship ---
const ProjectLabels = sequelize.define('ProjectLabels', {
  // We can add more fields to the join table here if needed in the future
}, { timestamps: true });

// And define the relationship using this explicit through model.
// This correctly creates a composite primary key on (ProjectId, LabelId).
Project.belongsToMany(Label, { through: ProjectLabels });
Label.belongsToMany(Project, { through: ProjectLabels });


module.exports = {
  sequelize,
  Project,
  Label,
  ProjectLabels, // Export the join model too
};
