const fs = require('fs');
const path = require('path');

/**
 * Parses a CSV file, handling quoted fields containing commas.
 * @param {string} filePath Absolute path to the CSV file.
 * @returns {Array<Object>} An array of objects representing rows.
 */
function parseCsv(filePath) {
    try {
        if (!fs.existsSync(filePath)) {
            console.error(`❌ CSV file not found: ${filePath}`);
            return [];
        }
        const data = fs.readFileSync(filePath, 'utf8');
        const lines = data.trim().split('\n').filter(line => line.trim() !== '');
        if (lines.length <= 1) return [];

        const headers = lines[0].replace(/^\uFEFF/, '').split(',').map(header => header.trim().toLowerCase());

        return lines.slice(1).map(line => {
            const values = [];
            let currentVal = '';
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') {
                    // Handle escaped quotes ("")
                    if (inQuotes && line[i + 1] === '"') {
                        currentVal += '"';
                        i++; // Skip the next quote
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
            values.push(currentVal.trim());

            if (values.length !== headers.length) {
                console.warn(`⚠️  Mismatched columns in ${path.basename(filePath)}: "${line}". Expected ${headers.length}, got ${values.length}. Padding with empty strings.`);
                while (values.length < headers.length) values.push('');
            }
            return headers.reduce((obj, header, index) => {
                // Remove surrounding quotes from the final value if they exist
                const finalValue = values[index] || '';
                obj[header] = finalValue.startsWith('"') && finalValue.endsWith('"')
                    ? finalValue.slice(1, -1)
                    : finalValue;
                return obj;
            }, {});
        });
    } catch (error) {
        console.error(`❌ Error parsing CSV ${filePath}:`, error);
        throw error;
    }
}

module.exports = { parseCsv };
