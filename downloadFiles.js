import axios from "axios";
import fs from "fs";

export async function downloadFiles(urls, directory) {
    const fileRequests = urls.map((url) => {
        console.log(`preparing to download url: ${url}`);
        return axios.get(url, { responseType: 'stream', timeout: 60000 });
    });

    console.log('start downloads');
    const responses = await Promise.all(fileRequests);

    let downloaded = 0;
    const pipes = responses.map((response) => {
        const headerLine = response.headers['content-disposition'];
        const filename = headerLine.split('=')[1];
        response.data.pipe(fs.createWriteStream(`${directory + '/' + filename}`));
        return new Promise((resolve, reject) => {
            response.data.on('end', () => {
                downloaded++;
                console.log(`Downloaded ${downloaded} of ${urls.length} - ${filename}`);
                resolve();
            }).on('error', (err) => {
                console.error('error', err);
                reject(err);
            });
        });
    });

    return Promise.all(pipes);
};



