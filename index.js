import axios from 'axios';
import axiosThrottle from 'axios-request-throttle';
import { downloadFiles } from './downloadFiles.js';
import scanner from "react-scanner";
import { getPackageVersions } from './getPackageVersions.js';
import { unzipAllInDirectory } from './unzipFiles.js';
import fs from 'fs';
import fsExtra from 'fs-extra/esm';

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
const GITHUB_TOKEN = args.GITHUB_TOKEN || process.env.GITHUB_TOKEN;
const githubApiUrl = 'https://api.github.com';
const now = new Date().toJSON().slice(0, 10);
const resultsDir = './results';
const packageVersionsToCheck = args.PACKAGES || ['hds-react', 'react', 'next', 'express', 'vite', 'gatsby', 'remix'];

// if no GITHUB_TOKEN exists -> exit with error
if (!GITHUB_TOKEN) {
    console.error('GITHUB_TOKEN is missing, please add it to your env or pass it as argument GITHUB_TOKEN=your_token_here');
    process.exit();
}

// if temp directory doesn't exist, create it
if (!fs.existsSync(tempDirectory)) {
    fs.mkdirSync(tempDirectory);
}

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

axios.defaults.headers.common['Authorization'] = `token ${GITHUB_TOKEN}`;
axiosThrottle.use(axios, { requestsPerSecond: 3 });

console.log('fetching repos data which contain hds-react in package.json');
const searchData = await axios.get(`${githubApiUrl}/search/code?q=hds-react+in:file+filename:package.json+org:${owner}&per_page=1000&page=1`);

console.log('repos data fetched');

// remove duplicates from data and also if name is helsinki-design-system or includes hds- (test projects usually)
const reposWithHdsData = searchData?.data?.items
    .filter((item, index) =>
        // remove duplicates
        searchData.data.items.findIndex((i) => i.repository.full_name === item.repository.full_name) === index &&
        item.repository.name !== 'helsinki-design-system' &&
        !item.repository.name.includes('hds-')
    )
    .map((item) => {
        return { full_name: item.repository.full_name };
    });

const allCommitsRequests = reposWithHdsData.map((repoItem) => {
    const [owner, repo] = repoItem.full_name.split('/');
    return axios.get(`${githubApiUrl}/repos/${repoItem.full_name}/commits`, { owner, repo });
});

console.log('fetching commits');
const allReposCommitDatas = await Promise.all(allCommitsRequests);
console.log('commits fetched');

// get the last commit date
reposWithHdsData.forEach((repo) => {
    // Check that the url contains the repo full_name in full (test by splitting with <repo-full_name>/ -> length should be 2)
    const latestCommit = allReposCommitDatas.find((commitDatas) => commitDatas.data[0].url.split(`${repo.full_name}/`).length === 2)?.data[0].commit?.committer?.date;
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

// now scan for the components usage
console.log('Running component usage analysis...');
const analysis = await analyze();
Object.entries(analysis).forEach(([componentName, componentData]) => {
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

// sort
reposWithHdsData.sort((a, b) => b.differentComponentsInUse - a.differentComponentsInUse);

// write reposWithHdsData to file
fs.writeFile(`${resultsDir}/${now}-by-repository.json`, JSON.stringify(reposWithHdsData, null, 2), 'utf8', function (err) {
    if (err) {
        return console.log(err);
    }
    console.log("The file was saved!");
});

console.log('clear temporary directory');
fsExtra.emptyDirSync(tempDirectory);