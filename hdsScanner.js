import fs from 'fs';
import path from 'path';

const currentDir = process.cwd();
const fileExtensions = ['.js', '.jsx', '.ts', '.tsx', '.yml', '.twig', '.html', '.htm', '.php'];
const leaveOutMatches = ['.test.', 'tests', '.d.ts', 'babel', 'config', 'types.js'];
const leaveOutDirectories = ['node_modules', 'dist', 'build', '__tests__', '__snapshots__', '__mocks__', '__tests_', '__test__', '__uploads__', '__uploads_'];

console.log('Current directory:', currentDir);

// scan all directories recursively for *.js and *.ts files, omitting node_modules directory
function scanDirectories(directory) {
    const files = [];

    function scan(directory) {
        const entries = fs.readdirSync(directory);

        for (const entry of entries) {
            const entryPath = path.join(directory, entry);
            const stats = fs.statSync(entryPath);
            if (stats.isDirectory() && !leaveOutDirectories.some((dir) => entry.includes(dir))) { 
                scan(entryPath);
            } else if (stats.isFile() && (
                fileExtensions.some((ext) => entry.endsWith(ext)) /* || true */ &&
                !leaveOutMatches.some((match) => entry.includes(match)) &&
                !entry.startsWith('.')
            )) {
                files.push(entryPath);
            }
        }
    }

    scan(directory);
    return files;
};

function scanFile(file) {
    let fileContent;
    try {
        fileContent = fs.readFileSync(file, 'utf8');
    } catch (err) {
        console.error('Error reading file:', file, err);
    }
    return fileContent;
}

function scanContentForHdsUsage(content) {
    // create a regex to match wanted content
    // const regex = /(?<![-#])hds-(?!react)[a-z0-9-]+|(\w*hdsRule\w*)+|(\w*hdsStyle\w*)/ig;
    const regex = /(?<![-#])hds-(?!react)[a-z0-9-]+|(getCriticalHdsRules)+|(getCriticalHdsRulesSync)+|(hdsStyles)/ig;
    // do not match content with - or # in front of hds- and omit hds-react
    const hdsComponents = content.match(regex);
    // console.log(hdsComponents);
    return hdsComponents;
};

export function hdsScanner(directory) {
    const files = scanDirectories(directory);
    console.log(files.length, 'files found in', directory);

    let hdsContents = {};
    files.forEach((file) => {
        const fileContent = scanFile(file);
        const hdsContent = scanContentForHdsUsage(fileContent);
        if (hdsContent) {
            // log the directory under currentDir where the hds usage was found
            console.log('HDS usage found in:', file);
            // get repo name from file
            // replace all \ with / to make it work on windows too
            const location = file.replace(/\\/g, '/');
            const repoName = location.split('City-of-Helsinki-')[1].split('/')[0].slice(0, -8);
            console.log(repoName);
            hdsContent.forEach((hdsItem) => {
                if (!hdsContents[repoName]) {
                    hdsContents[repoName] = {};
                }
                hdsContents[repoName][hdsItem] = hdsContents[repoName][hdsItem] ? hdsContents[repoName][hdsItem] + 1 : 1;
            });

            // sort object values
            const data = Object.fromEntries(
                Object.entries(hdsContents[repoName]).sort(([,a],[,b]) => b-a)
            );

            // and reassign
            hdsContents[repoName] = data;
        }
    });

    console.log('HDS contents found in:', hdsContents, Object.keys(hdsContents).length);
    console.log('scanned files:', files.length);
    return hdsContents;
};

// const directoryToScan = `${currentDir}/tmp`; // replace with the directory you want to scan
// const data = hdsCoreScanner(directoryToScan);
// console.log(data);