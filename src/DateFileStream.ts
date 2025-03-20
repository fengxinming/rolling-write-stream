/* eslint-disable @typescript-eslint/restrict-plus-operands */
import { readdir } from 'node:fs/promises';
import { join, parse, ParsedPath } from 'node:path';

import { compile, isAfter, parse as parseDate } from 'date-manip';

import BaseStream from './BaseStream';
import { escapeRegExp, getNewDate, moveFile } from './common';
import { DateRollingOptions } from './typings';

function buildFileNameRegex(opts: DateRollingOptions, parsedFilePath: ParsedPath, datePattern: string): RegExp {
  const escapedSep = escapeRegExp(opts.fileNameSep);

  return opts.keepFileExt
  // 匹配格式：{name}.{date}.{index}{ext}
  // Match format: {name}.{date}.{index}{ext}
    ? new RegExp(
      `^${escapeRegExp(parsedFilePath.name)}`
              + `${escapedSep}${datePattern}`
              + `${escapedSep}(\\d+)`
              + `${escapeRegExp(parsedFilePath.ext)}$`
    )
  // 匹配格式：{name}{ext}.{date}.{index}
  // Match format: {name}{ext}.{date}.{index}
    : new RegExp(
      `^${escapeRegExp(parsedFilePath.name)}`
              + `${escapeRegExp(parsedFilePath.ext)}`
              + `${escapedSep}${datePattern}`
              + `${escapedSep}(\\d+)$`
    );
}

const fileNameSort = (a: any[], b: any[]) => {
  // 比较日期（降序）
  // Compare dates (descending)
  const aDate = parseDate(a[0]);
  const bDate = parseDate(b[0]);
  if (isAfter(aDate, bDate)) {
    return -1;
  }

  // 日期相同时比较序号（升序）
  // When dates are the same, compare indexes (ascending)
  return a[1] - b[1];
};

export default class DateFileStream extends BaseStream {
  protected readonly options!: DateRollingOptions;
  private readonly parsedFilePath: ParsedPath;
  private readonly fileNameMatcher: RegExp;
  private currentDate: string;
  private newDate: string;

  constructor(filePath: string, options?: Partial<DateRollingOptions>) {
    options = Object.assign({
      pattern: 'YYYY-MM-DD'
    }, options);
    super(filePath, options);

    const pattern = options.pattern as string;

    this.currentDate = getNewDate(pattern);
    this.newDate = this.currentDate;

    const parsedFilePath = parse(filePath);

    this.fileNameMatcher = buildFileNameRegex(
      this.options,
      parsedFilePath,
      compile(pattern).pattern
    );
    this.parsedFilePath = parsedFilePath;
  }

  protected async shouldRoll(chunkSize: number): Promise<boolean> {
    const newDate = getNewDate(this.options.pattern);

    // 优先处理日期变更
    // Handle date change first
    if (newDate !== this.currentDate) {
      this.newDate = newDate;
      return true;
    }

    // 其次检查文件大小
    // Check file size
    return super.shouldRoll(chunkSize);
  }

  protected async rotateFiles(): Promise<void> {
    const { options: { backups, compress }, currentDate, newDate } = this;
    let date: string;

    if (currentDate !== newDate) {
      date = newDate;
    }
    else {
      date = currentDate;

      // 从高索引向低索引移动，避免覆盖
      // Move from high index to low index to avoid overwriting
      for (let i = backups - 1; i >= 1; i--) {
        await moveFile(
          this.getRollingFilePath(date, i),
          this.getRollingFilePath(date, i + 1),
          compress
        );
      }
    }

    // 移动当前文件到 .1
    // Move the current file to .1
    await moveFile(
      this.filePath,
      this.getRollingFilePath(date, 1),
      compress
    );

    this.currentDate = newDate;
  }

  protected async getOldFiles(): Promise<string[]> {
    const { options: { backups }, parsedFilePath: { dir }, fileNameMatcher } = this;
    const files = await readdir(dir);

    return files
      .reduce((acc, file) => {
        const match = fileNameMatcher.exec(file);
        if (match) {
          acc.push([
            match.slice(1, -1).map((v, i) => (i === 1 ? +v - 1 : +v)),
            +match[match.length - 1],
            join(dir, file)
          ]);
        }
        return acc;
      }, [] as any[][])
      .sort(fileNameSort)
      .reduce((acc, curr) => {
        if (backups < curr[1]) {
          acc.push(curr[2]);
        }
        return acc;
      }, [] as string[]);
  }

  private getRollingFilePath(date: string, index: number): string {
    const { parsedFilePath: { dir, name, ext } } = this;
    const { fileNameSep, keepFileExt } = this.options;

    let fullPath = join(dir, name);

    // 扩展名位置处理
    // Extension position handling
    if (keepFileExt) {
      // 格式：{name}.{date}.{index}{ext}
      // Format: {name}.{date}.{index}{ext}
      fullPath += fileNameSep + date;
      if (index > 0) {
        fullPath += fileNameSep + index;
      }
      fullPath += ext;
    }
    else {
      // 格式：{name}{ext}.{date}.{index}
      // Format: {name}{ext}.{date}.{index}
      fullPath += ext + fileNameSep + date;
      if (index > 0) {
        fullPath += fileNameSep + index;
      }
    }

    return fullPath;
  }
}
