import { readdir } from 'node:fs/promises';
import { join, parse, ParsedPath } from 'node:path';

import BaseStream from './BaseStream';
import { defaultOptions, escapeRegExp, moveFile } from './common';
import { RollingOptions } from './typings';


export default class FileStream extends BaseStream {
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
      // Match format: {name}.{index}{ext}
      ? new RegExp(
        `^${escapeRegExp(parsedFilePath.name)}`
              + `${escapedSep}(\\d+)`
              + `${escapeRegExp(parsedFilePath.ext)}$`
      )
      // 匹配格式：{name}{ext}.{index}
      // Match format: {name}{ext}.{index}
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

  protected async rotateFiles(): Promise<void> {
    const { options: { backups, compress } } = this;

    // 从高索引向低索引移动，避免覆盖
    // Move from high index to low index to avoid overwriting
    for (let i = backups - 1; i >= 1; i--) {
      await moveFile(
        this.getRollingFilePath(i),
        this.getRollingFilePath(i + 1),
        compress
      );
    }

    // 移动当前文件到 .1
    // Move the current file to .1
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

  private getRollingFilePath(index?: number): string {
    const { parsedFilePath: { dir, name, ext } } = this;
    const { fileNameSep, keepFileExt } = this.options;

    let fullPath = join(dir, name);

    // 扩展名位置处理
    // Extension position handling
    if (keepFileExt) {
      // 格式：{name}.{index}{ext}
      // Format: {name}.{index}{ext}
      if (index !== void 0) {
        fullPath += fileNameSep + String(index);
      }
      fullPath += ext;
    }
    else {
      // 格式：{name}{ext}.{index}
      // Format: {name}{ext}.{index}
      fullPath += ext;
      if (index !== void 0) {
        fullPath += fileNameSep + String(index);
      }
    }

    return fullPath;
  }
}
