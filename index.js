import { ConcurrentPromiseQueue } from "concurrent-promise-queue";
import { downloadFiles } from './downloadFiles.js';
import { fetcher } from './fetcher.js';
import { getPackageVersions } from './getPackageVersions.js';
import { hdsScanner } from "./hdsScanner.js";
import { unzipAllInDirectory } from './unzipFiles.js';
import fs from 'fs';
import fsExtra from 'fs-extra/esm';
import scanner from "react-scanner";

const requiredNodeVersion = '20.12.2';

// check nodejs version
const nodeVersion = process.versions.node;
if (nodeVersion !== requiredNodeVersion) {
    console.error(`Node version should be ${requiredNodeVersion}, you have ${nodeVersion} in use, exiting...`);
    process.exit();
}

// parse all command line given arguments which are separated by space and key=value pairs
const commandLineArgs = process.argv.slice(2);
const args = {};
commandLineArgs.forEach(arg => {
    const [key, value] = arg.split('=');
    args[key] = value?.split(',') || true;
});

const owner = 'City-of-Helsinki';
const currentDir = process.cwd();
const tempDirectory = `${currentDir}/tmp`;
global.GITHUB_TOKEN = args.GITHUB_TOKEN || process.env.GITHUB_TOKEN;
const githubApiUrl = 'https://api.github.com';
const now = new Date().toJSON().slice(0, 10);
const resultsDir = './tmp_results';
const packageVersionsToCheck = args.PACKAGES || [
    'hds-react',
    'hds-core',
    'hds-design-tokens',
    'hds-js',
    'react',
    'next',
    'express',
    'vite',
    'gatsby',
    'remix'
];

// if no GITHUB_TOKEN exists -> exit with error
if (!GITHUB_TOKEN) {
    console.error('GITHUB_TOKEN is missing, please add it to your env or pass it as argument GITHUB_TOKEN=your_token_here');
    process.exit();
}

// if temp directory doesn't exist, create it
if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir);
}

// if temp directory doesn't exist, create it
if (!fs.existsSync(tempDirectory)) {
    fs.mkdirSync(tempDirectory);
}

console.log('clear temporary directory');
await fsExtra.emptyDirSync(tempDirectory);

const scannerConfig = {
    crawlFrom: `${tempDirectory}`,
    importedFrom: 'hds-react',
    exclude: (dirname) => dirname === 'node_modules',
    processors: [
        ["count-components", { outputTo: `${resultsDir}/${now}-by-count.json` }],
        ["count-components-and-props", { outputTo: `${resultsDir}/${now}-by-count-and-props.json` }],
        "raw-report",
    ],
    includeSubComponents: true,
};

async function analyze() {
    return await scanner.run(scannerConfig, '', 'programmatic');
}

async function getHdsComponentsList() {
    const hdsDirectory = fs.readdirSync(tempDirectory).find((dir) => dir.includes('helsinki-design-system'));
    const hdsFileContent = fs.readFileSync(`${tempDirectory}/${hdsDirectory}/packages/react/src/components/index.ts`, 'utf8');
    const topLevelExports = hdsFileContent.match(/'(\.\/[a-zA-Z0-9-]+)';/g).map((component) => component.slice(3, -2));
    // then get all components from the files
    const components = [];
    topLevelExports.forEach((component) => {
        const componentFileContent = fs.readFileSync(`${tempDirectory}/${hdsDirectory}/packages/react/src/components/${component}/index.ts`, 'utf8');
        const subComponents = [...new Set(componentFileContent.match(/\b[A-Z][a-zA-Z0-9-]+\b/g))];
        if (subComponents) {
            components.push(...subComponents);
        }
    }
    );

    console.log('remove helsinki-design-system folder');
    // we need to remove the helsinki-design-system folder now not to scan it later
    await fsExtra.removeSync(`${tempDirectory}/${hdsDirectory}`);
    console.log('helsinki-design-system folder removed');

    return components;
}

console.log('fetching repos data which contain hds- in package.json');

// initialize with total_count 1 to get into the loop
let searchData = { items: [], total_count: 1 };
let page = 1;

while (searchData.items.length < searchData.total_count) {
    console.log('fetching page', page);
    const fetchData = await fetcher(`${githubApiUrl}/search/code?q=hds-+in:file+filename:package.json+org:${owner}&per_page=100&page=${page}`);
    const jsonData = await fetchData.json();
    searchData = { total_count: jsonData.total_count, items: [...searchData.items, ...jsonData.items] };
    page++;
}

// remove duplicates from data and also if name is helsinki-design-system or includes hds- (test projects usually)
const reposWithHdsData = searchData?.items
    .filter((item, index) =>
        // remove duplicates
        searchData.items.findIndex((i) => i.repository.full_name === item.repository.full_name) === index &&
        // remove helsinki-design-system and hds- projects (for now don't remove since we need the info of non-used components too)
        // item.repository.name !== 'helsinki-design-system' &&
        !item.repository.name.includes('hds-')
    )
    .map((item) => {
        return { full_name: item.repository.full_name };
    });

const allCommitsRequests = reposWithHdsData.map((repoItem) => {
    const [owner, repo] = repoItem.full_name.split('/');
    return () => fetcher(`${githubApiUrl}/repos/${repoItem.full_name}/commits`, { owner, repo });
});

const commitsQueue = new ConcurrentPromiseQueue({
    unitOfTimeMillis: 500,
    maxNumberOfConcurrentPromises: 2
});
let allReposCommitDatas = [];
try {
    console.log('Fetching commits');
    const allReposCommitsFetches = await Promise.all(allCommitsRequests.map((request) => commitsQueue.addPromise(request)));
    allReposCommitDatas = await Promise.all(allReposCommitsFetches.map((data) => data.json()));
} catch (error) {
    console.error('Error fetching commits', error);
}
console.log('commits fetched');

// get the last commit date
reposWithHdsData.forEach((repo) => {
    // Check that the url contains the repo full_name in full (test by splitting with <repo-full_name>/ -> length should be 2)
    const latestCommit = allReposCommitDatas.find((commitDatas) => commitDatas[0].url.split(`${repo.full_name}/`).length === 2)?.[0].commit?.committer?.date;
    repo.latestCommit = latestCommit;
});

const zipUrls = reposWithHdsData.map((repoItem) => `${githubApiUrl}/repos/${repoItem.full_name}/zipball`);

console.log('downloading zips');
await downloadFiles(zipUrls, tempDirectory);
console.log('downloading zips done');

console.log('start unzipping zips');
await unzipAllInDirectory(tempDirectory);
console.log('unzipping done');

console.log('parsing used package versions from repos');
const packageVersions = getPackageVersions(`${tempDirectory}`, owner, packageVersionsToCheck);
console.log('used package versions parsed from repos');

// append to repoData
reposWithHdsData.forEach((repo) => {
    const repoPackageVersions = packageVersions.find((item) => item.repo === repo.full_name.split('/')[1]).packages;
    repo.packages = repoPackageVersions;
    // also set differentComponentsInUse to 0
    repo.differentComponentsInUse = 0;
});

console.log('scan helsinki-design-system components');
const hdsComponents = await getHdsComponentsList();
let nonUsedComponents = [...hdsComponents];
console.log('hds components scanned');

// now scan for the components usage
console.log('Running React component usage analysis...');
const analysis = await analyze();
Object.entries(analysis).forEach(([componentName, componentData]) => {
    // remove component from nonUsedComponents, check case insensitively
    console.log(componentName, nonUsedComponents.findIndex((comp) => comp.toLowerCase() === componentName.toLowerCase()));
    const index = nonUsedComponents.findIndex((comp) => comp.toLowerCase() === componentName.toLowerCase());
    if (index > -1) {
        nonUsedComponents.splice(index, 1);
    }

    componentData.instances.forEach((instance) => {
        // replace all \ with / to make it work on windows too
        const location = instance.location.file.replace(/\\/g, '/');
        const repoName = location.split(`${owner}-`)[1].split('/')[0].slice(0, -8);

        // and add to repoWithHdsData, need to match 
        const foundRepo = reposWithHdsData.find((repoData) => repoData.full_name.split('/')[1] === repoName);
        if (foundRepo) {
            if (!foundRepo.components) {
                foundRepo.components = {};
            }
            // put into components object as object with key as component name and value as count
            if (!foundRepo.components[componentName]) {
                foundRepo.components[componentName] = 1;
            } else {
                foundRepo.components[componentName] = foundRepo.components[componentName] + 1;
            }

            foundRepo.differentComponentsInUse = Object.keys(foundRepo.components).length;
            foundRepo.components = Object.fromEntries(Object.entries(foundRepo.components).sort(([, a], [, b]) => b - a));
        }
    });
});

console.log('Run hds-core component analysis');
const hdsScan = hdsScanner(tempDirectory);
console.log('hds-core component analysis done');

// append to data
reposWithHdsData.forEach((repo) => {
    const repoName = repo.full_name.split('/')[1];
    if (hdsScan[repoName]) {
        repo.deepScan = hdsScan[repoName];
    }
});

// put nonUsedComponents to reposWithHdsDatas 'helsinki-design-system'
reposWithHdsData.find((repo) => repo.full_name.split('/')[1] === 'helsinki-design-system').nonUsedComponents = nonUsedComponents;

// sort
reposWithHdsData.sort((a, b) => b.differentComponentsInUse - a.differentComponentsInUse);


// separate helsinki-design-system from the rest and write to own file
const isHDSMainRepo = (repo) => repo.full_name.split('/')[1] === 'helsinki-design-system';
const hdsRepoData = reposWithHdsData.find(isHDSMainRepo);
const clientReposData = reposWithHdsData.filter((repo) => !isHDSMainRepo(repo));

// write hdsRepoData to file
fs.writeFileSync(`${resultsDir}/${now}-helsinki-design-system.json`, JSON.stringify(hdsRepoData, null, 2), 'utf8', function (err) {
    if (err) {
        return console.log(err);
    }
});

// write reposWithHdsData to file
fs.writeFileSync(`${resultsDir}/${now}-by-repository.json`, JSON.stringify(clientReposData, null, 2), 'utf8', function (err) {
    if (err) {
        return console.log(err);
    }
});

console.log("Results written to files");

console.log('clear temporary directory');
await fsExtra.emptyDirSync(tempDirectory);
console.log('temporary directory cleared');
