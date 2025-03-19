import { createReadStream, createWriteStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { createGzip } from 'node:zlib';

import { format } from 'date-manip';
import { move, pathExists } from 'fs-extra';

import { RollingOptions } from './typings';

export function defaultOptions(): RollingOptions {
  return {
    objectMode: false,
    highWaterMark: 128 * 1024,
    maxSize: 0,
    backups: 1,
    compress: false,
    encoding: 'utf8',
    mode: 0o600,
    flags: 'a',
    keepFileExt: false,
    fileNameSep: '.',
    useLock: false,
    syncThreshold: 0,
    syncInterval: 10000
  };
}

async function compressFile(source: string, target: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const readStream = createReadStream(source);
    const writeStream = createWriteStream(`${target}.gz`);
    const gzip = createGzip();

    readStream
      .pipe(gzip)
      .pipe(writeStream)
      .on('finish', () => unlink(source).then(resolve).catch(reject))
      .on('error', reject);
  });
}

export async function moveFile(source: string, target: string, compress: boolean): Promise<void> {
  if (!(await pathExists(source))) {
    return;
  }
  if (compress) {
    await compressFile(source, target);
  }
  else {
    await move(source, target, { overwrite: true });
  }

}

export function getNewDate(pattern: string): string {
  return format(new Date(), pattern);
}

export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
