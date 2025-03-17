import { readdir } from 'node:fs/promises';
import { join, parse, ParsedPath } from 'node:path';

import BaseRollingStream from './BaseRollingStream';
import { defaultOptions, escapeRegExp, moveFile } from './common';
import { RollingOptions } from './typings';


export default class RollingFileStream extends BaseRollingStream {
  protected options!: RollingOptions;
  private readonly parsedFilePath: ParsedPath;
  private readonly filePattern: RegExp;

  constructor(filePath: string, options: Partial<RollingOptions> = {}) {
    super(filePath, options);
    const parsedFilePath = parse(filePath);

    const { options: fixedOpts } = this;
    const escapedSep = escapeRegExp(fixedOpts.fileNameSep);

    this.filePattern = fixedOpts.keepFileExt
      // 匹配格式：{name}.{index}{ext}
      ? new RegExp(
        `^${escapeRegExp(parsedFilePath.name)}`
              + `${escapedSep}(\\d+)`
              + `${escapeRegExp(parsedFilePath.ext)}$`
      )
      // 匹配格式：{name}{ext}.{index}
      : new RegExp(
        `^${escapeRegExp(parsedFilePath.name)}`
              + `${escapeRegExp(parsedFilePath.ext)}`
              + `${escapedSep}(\\d+)$`
      );
    this.parsedFilePath = parsedFilePath;
  }

  protected getDefaultOptions(): RollingOptions {
    return defaultOptions();
  }

  protected async shouldRoll(): Promise<boolean> {
    const { maxSize } = this.options;
    return maxSize > 0 && maxSize <= this.currentSize;
  }

  protected async rotateFiles(): Promise<void> {
    const { options: { backups, compress } } = this;

    // 从高索引向低索引移动，避免覆盖
    for (let i = backups - 1; i >= 1; i--) {
      await moveFile(
        this.getRollingFilePath(i),
        this.getRollingFilePath(i + 1),
        compress
      );
    }

    // 移动当前文件到 .1
    await moveFile(
      this.filePath,
      this.getRollingFilePath(1),
      compress
    );
  }

  protected async getOldFiles(): Promise<string[]> {
    const { options: { backups }, parsedFilePath: { dir }, filePattern } = this;

    const files = await readdir(dir);
    return files.reduce((acc, file) => {
      const match = filePattern.exec(file);
      if (match && backups < parseInt(match[1], 10)) {
        acc.push(join(dir, file));
      }
      return acc;
    }, [] as string[]);
  }

  private getRollingFilePath(index: number): string {
    const { parsedFilePath, options } = this;
    let fileName: string;

    if (options.keepFileExt) {
      // 保留扩展名格式：{name}.{index}{ext}
      fileName = `${parsedFilePath.name}${options.fileNameSep}${index}${parsedFilePath.ext}`;
    }
    else {
      // 不保留扩展名格式：{name}{ext}.{index}
      fileName = `${parsedFilePath.name}${parsedFilePath.ext}${options.fileNameSep}${index}`;
    }

    return join(parsedFilePath.dir, fileName);
  }
}
