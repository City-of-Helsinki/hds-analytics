import fs from 'fs';
import unzipper from 'unzipper';

export async function unzipAllInDirectory(path) {
    let unzipped = 0;
    const zipFilenames = fs.readdirSync(path).filter((filename) => filename.endsWith('.zip'));
    const unzips = zipFilenames.map((fileName) => {
        return new Promise((resolve, reject) => {
            fs.createReadStream(`${path}/${fileName}`)
                .pipe(unzipper.Extract({ path: path }))
                .on('close', function () {
                    unzipped++;
                    console.log(`Unzipped ${unzipped}/${zipFilenames.length} -> ${fileName}`);
                    resolve();
                }).on('error', function (err) {
                    console.error('error', err);
                    reject(err);
                });
        });
    });

    return Promise.all(unzips);
};
