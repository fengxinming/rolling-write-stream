import { createWriteStream, fsync, fsyncSync, mkdirSync, statSync, WriteStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve as pathResolve } from 'node:path';
import { Writable } from 'node:stream';

import { lock } from 'proper-lockfile';

import { defaultOptions } from './common';

type WriteStreamWithFD = WriteStream & { fd: number };
function normalizePath(filePath: string): string {
  if (filePath.startsWith('~')) {
    return join(homedir(), filePath.slice(1));
  }
  return pathResolve(filePath);
}

export default abstract class BaseStream extends Writable {
  protected currentSize = 0;
  protected currentFileStream!: WriteStreamWithFD;
  protected filePath: string;
  protected options: any;
  private lastSyncTime = Date.now();
  private pendingSyncSize = 0;

  constructor(
    filePath: string,
    options?: any,
  ) {
    super(options = Object.assign(defaultOptions(), options));
    this.options = options;
    this.filePath = normalizePath(filePath);
    this.initialize();
  }


  async _write(
    chunk: Buffer,
    encoding: BufferEncoding,
    callback: (error?: Error) => void
  ): Promise<void> {
    const byteSize = chunk.length;

    try {
      // 滚动逻辑
      // Rolling logic
      if (await this.shouldRoll(byteSize)) {
        // 在滚动操作内加锁
        // Lock during rolling operation
        await this.tryLock(() => {
          return this.performRoll();
        });
      }
    }
    catch (err) {
      callback(err as Error);
      return;
    }

    const { currentFileStream } = this;

    currentFileStream.write(chunk, encoding, (err) => {
      if (!err) {
        this.currentSize += byteSize;

        // 刷新磁盘
        // Flush to disk
        this.handleSync(byteSize);

        callback();
      }
      else {
        callback(err);
      }
    });
  }

  _final(callback: (error?: Error) => void): void {
    this.currentFileStream.end(callback);
  }

  _destroy(error: Error, callback: () => void): void {
    this.finalSync()
      .then(() => this.currentFileStream.destroy(error || undefined))
      .catch((syncErr) => this.emit('error', syncErr))
      .finally(() => callback());
  }

  protected initialize(): void {
    const { filePath } = this;

    // 生成文件夹
    // Create the directory if it doesn't exist
    const dir = dirname(filePath);
    mkdirSync(dir, { recursive: true });

    // 获取文件大小
    // Get the file size
    try {
      const stats = statSync(filePath);
      this.currentSize = stats.size;
    }
    catch {
      this.currentSize = 0;
    }

    // 创建文件流
    // Create the file stream
    this.renewWriteStream();
  }

  protected renewWriteStream(): void {
    this.currentFileStream?.end();
    const { options } = this;
    this.currentFileStream = createWriteStream(
      this.filePath,
      {
        flags: options.flags,
        encoding: options.encoding,
        mode: options.mode,
        highWaterMark: options.highWaterMark
      }
    ) as WriteStreamWithFD;
  }

  protected async cleanOldFiles(): Promise<void> {
    const oldFiles = await Promise.resolve(this.getOldFiles());
    if (oldFiles.length > 0) {
      await Promise.allSettled(oldFiles.map((f) => unlink(f)));
    }
  }

  protected async performRoll(): Promise<void> {
    // 1. 移动旧文件
    // Move old files
    await this.rotateFiles();
    // 2. 重置当前文件大小并创建新流
    // Reset the current file size and create a new stream
    this.currentSize = 0;
    this.renewWriteStream();
    // 3. 清理旧备份
    // Clean up old backups
    await this.cleanOldFiles();
  }

  protected async shouldRoll(chunkSize: number): Promise<boolean> {
    const { maxSize } = this.options;

    // 禁用大小滚动
    // Disable size-based rolling if maxSize is not set
    if (maxSize <= 0) {
      return false;
    }

    // 首次写入且文件为空时，不触发滚动
    // Skip rolling if the file is empty on the first write
    if (this.currentSize === 0) {
      return false;
    }

    // 写入空数据时，不触发滚动
    // No need to roll if the chunk is empty
    if (chunkSize === 0) {
      return false;
    }

    // 检查单次写入或累积大小是否超过阈值
    // Check if the chunk size or accumulated size exceeds the threshold
    return chunkSize > maxSize || (this.currentSize + chunkSize) > maxSize;
  }

  private async tryLock(cb: () => Promise<void>): Promise<any> {
    if (this.options.useLock) {
      const release = await lock(this.filePath, { retries: 3 });
      try {
        return cb();
      }
      finally {
        // 确保锁释放
        // Make sure the lock is released
        await release();
      }
    }
    else {
      return cb();
    }
  }

  private finalSync(): Promise<void> {
    return new Promise((resolve, reject) => {
      const { fd } = this.currentFileStream;
      if (!fd) {
        resolve();
      }
      else {
        fsync(fd, (err) => (err ? reject(err) : resolve()));
      }
    });
  }

  private handleSync(byteSize: number): void {
    const { syncInterval, syncThreshold } = this.options;

    if (
      (syncThreshold > 0 && (this.pendingSyncSize += byteSize) >= syncThreshold)
      || (syncInterval > 0 && Date.now() - this.lastSyncTime >= syncInterval)
    ) {
      try {
        // 同步文件数据到磁盘
        // Sync file data to disk
        fsyncSync(this.currentFileStream.fd);
        this.pendingSyncSize = 0;
        this.lastSyncTime = Date.now();
      }
      catch (e) {
        // 触发 error 事件
        // Trigger error event
        this.emit('error', e);
      }
    }
  }

  protected abstract getOldFiles(): string[] | Promise<string[]>;
  protected abstract rotateFiles(): Promise<void>;
}

