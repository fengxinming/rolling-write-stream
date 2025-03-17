import { createWriteStream, mkdirSync, statSync, WriteStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve as pathResolve } from 'node:path';
import { Writable } from 'node:stream';

import { lock } from 'proper-lockfile';
function normalizePath(filePath: string): string {
  if (filePath.startsWith('~')) {
    return join(homedir(), filePath.slice(1));
  }
  return pathResolve(filePath);
}

export default abstract class BaseRollingStream extends Writable {
  protected currentSize = 0;
  protected currentFileStream?: WriteStream;
  protected filePath: string;
  protected options: any;

  constructor(
    filePath: string,
    options: any,
  ) {
    super(Object.assign({ objectMode: false, highWaterMark: 64 * 1024 }, options)); // 64KB缓冲区
    this.filePath = normalizePath(filePath);
    this.options = { ...this.getDefaultOptions(), ...options };
    this.initialize();
  }


  async _write(
    chunk: Buffer,
    encoding: BufferEncoding,
    callback: (error?: Error) => void
  ): Promise<void> {
    try {
      // 先检查是否需要滚动
      if (await this.shouldRoll()) {
        await this.performRoll();
      }

      // 再写入数据
      const release = await lock(this.filePath);
      try {
        await new Promise((resolve, reject) => {
          this.currentFileStream!.write(chunk, this.options.encoding, (err) => {
            if (err) {
              reject(err);
            }
            resolve(void 0);
          });
        });
      }
      finally {
        await release();
      }

      this.currentSize += chunk.length;

      callback();
    }
    catch (error) {
      callback(error as Error);
    }
  }

  _final(callback: (error?: Error) => void): void {
    this.currentFileStream?.end(callback);
  }

  protected initialize(): void {
    const { filePath } = this;

    // 生成文件夹
    const dir = dirname(filePath);
    mkdirSync(dir, { recursive: true });

    // 获取文件大小
    try {
      const stats = statSync(filePath);
      this.currentSize = stats.size;
    }
    catch {
      this.currentSize = 0;
    }

    // 创建文件流
    this.renewWriteStream();
  }

  protected renewWriteStream(): void {
    this.currentFileStream?.end();
    this.currentFileStream = createWriteStream(
      this.filePath,
      {
        flags: this.options.flags,
        encoding: this.options.encoding,
        mode: this.options.mode
      }
    );
  }

  protected async performRoll(): Promise<void> {
    // 移动当前文件到备份位置
    await this.rotateFiles();

    // 重置状态并创建新文件流
    this.currentSize = 0;
    this.renewWriteStream();

    // 清理旧备份
    await this.cleanOldFiles();
  }

  protected async cleanOldFiles(): Promise<void> {
    const oldFiles = await Promise.resolve(this.getOldFiles());
    if (oldFiles.length > 0) {
      await Promise.allSettled(oldFiles.map((f) => unlink(f)));
    }
  }

  protected abstract getDefaultOptions(): Record<string, any>;
  protected abstract getOldFiles(): string[] | Promise<string[]>;
  protected abstract shouldRoll(): Promise<boolean>;
  protected abstract rotateFiles(): Promise<void>;
}

