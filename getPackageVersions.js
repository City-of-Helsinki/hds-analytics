import fs from 'fs';
import path from 'path';

// find all package.json files under unzipped folder recursively
const findPackageJsonFiles = (dir, files_) => {
    files_ = files_ || [];
    const files = fs.readdirSync(dir);
    for (const i in files) {
        const name = dir + '/' + files[i];
        if (fs.statSync(name).isDirectory()) {
            findPackageJsonFiles(name, files_);
        } else if (name.includes('package.json')) {
            files_.push(name);
        }
    }
    return files_;
};

export const getPackageVersions = (pathToRepos, owner, packagesToInclude) => {
    const allPackageJsonFiles = findPackageJsonFiles(pathToRepos);

    // check the used versions of given packages to include in all package.jsons
    const packageVersions = allPackageJsonFiles.map((file) => {
        console.log('scanning package.json file: ', file);
        const dirName = path.dirname(file);
        const repoName = dirName.split(`${owner}-`)[1].split('/')[0].slice(0, -8);
        const content = fs.readFileSync(file, 'utf8');
        const json = JSON.parse(content);

        const packages = {};
        packagesToInclude.forEach((packageName) => {
            const version = json?.dependencies?.[packageName] || json?.devDependencies?.[packageName];
            if (version) {
                packages[packageName] = version;
            }
        });

        return { repo: repoName, packages}
    }).reduce((acc, curr) => {
        const existing = acc.find((item) => item.repo === curr.repo);
        if (existing) {
            Object.entries(curr.packages).forEach(([packageName, version]) => {
                if (existing.packages[packageName] === undefined) {
                    existing.packages[packageName] = version;
                } else if (!existing.packages[packageName].includes(version)) {
                    existing.packages[packageName] = `${existing.packages[packageName]}, ${version}`;
                }
            });
        } else {
            acc.push(curr);
        }
        return acc;
    }   , []);
    
    return packageVersions;
}