import { fetcher } from "./fetcher.js";
import { Readable } from 'node:stream';
import { writeFile } from 'node:fs/promises'
import { ConcurrentPromiseQueue } from "concurrent-promise-queue";

let downloads = 0;

async function downloadFile(url, directory) {
    const response = await fetcher(url);
    const filename = response.headers.get('content-disposition').split('=')[1];
    const body = Readable.fromWeb(response.body);
    await writeFile(`${directory + '/' + filename}`, body);
    downloads--;
    console.log(`Downloaded ${filename}`);
    console.log(`Downloads left: ${downloads}`);
}

export async function downloadFiles(urls, directory) {
    const downloadsQueue = new ConcurrentPromiseQueue({
        unitOfTimeMillis: 1000,
        maxNumberOfConcurrentPromises: 1,
    });

    downloads = urls.length;
    console.log(`Start downloading ${downloads} files...`);

    const pipes = urls.map((url) => {
        return () => downloadFile(url, directory);
    });

    return Promise.all(pipes.map((pipe) => downloadsQueue.addPromise(pipe)));
};
