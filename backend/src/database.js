// backend/src/database.js
const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');
const storagePath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'database.sqlite');

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
    // --- NEW FIELDS ---
    github_url: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: { isUrl: true }
    },
    deployed_url: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: { isUrl: true }
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true,
    }
}, { timestamps: true });

const Label = sequelize.define('Label', {
    label_name: { type: DataTypes.STRING, allowNull: false, unique: true },
    label_type: { type: DataTypes.STRING, allowNull: false },
    icon_filename: { type: DataTypes.STRING },
}, { timestamps: false });

const ProjectLabels = sequelize.define('ProjectLabels', {}, { timestamps: true });
Project.belongsToMany(Label, { through: ProjectLabels });
Label.belongsToMany(Project, { through: ProjectLabels });

module.exports = { sequelize, Project, Label, ProjectLabels };
