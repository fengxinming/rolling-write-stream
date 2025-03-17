/* eslint-disable @typescript-eslint/restrict-plus-operands */
import { readdir } from 'node:fs/promises';
import { join, parse, ParsedPath } from 'node:path';

import { compile, isAfter, parse as parseDate } from 'date-manip';

import BaseRollingStream from './BaseRollingStream';
import { defaultOptions, escapeRegExp, getNewDate, moveFile } from './common';
import { DateRollingOptions } from './typings';

const fileNameSort = (a: any[], b: any[]) => {
  // 比较日期（降序）
  const aDate = parseDate(a[0]);
  const bDate = parseDate(b[0]);

  if (isAfter(aDate, bDate)) {
    return -1;
  }

  // 日期相同时比较序号（升序）
  return a[1] - b[1];
};

export default class DateRollingFileStream extends BaseRollingStream {
  protected readonly options!: DateRollingOptions;
  private readonly parsedFilePath: ParsedPath;
  private readonly filePattern: RegExp;
  private currentDate: string;
  private newDate: string;

  constructor(filePath: string, options: Partial<DateRollingOptions> = {}) {
    super(filePath, options);
    this.currentDate = getNewDate(this.options.pattern);
    this.newDate = this.currentDate;

    const parsedFilePath = parse(filePath);

    const { options: fixedOpts } = this;
    const escapedSep = escapeRegExp(fixedOpts.fileNameSep);
    const datePattern = compile(this.options.pattern).pattern;

    this.filePattern = fixedOpts.keepFileExt
      // 匹配格式：{name}.{date}.{index}{ext}
      ? new RegExp(
        `^${escapeRegExp(parsedFilePath.name)}`
                  + `${escapedSep}${datePattern}`
                  + `${escapedSep}(\\d+)`
                  + `${escapeRegExp(parsedFilePath.ext)}$`
      )
      // 匹配格式：{name}{ext}.{date}.{index}
      : new RegExp(
        `^${escapeRegExp(parsedFilePath.name)}`
                  + `${escapeRegExp(parsedFilePath.ext)}`
                  + `${escapedSep}${datePattern}`
                  + `${escapedSep}(\\d+)$`
      );
    this.parsedFilePath = parsedFilePath;
  }

  protected getDefaultOptions(): DateRollingOptions {
    return Object.assign(defaultOptions(), {
      pattern: 'YYYY-MM-DD'
    });
  }

  protected async shouldRoll(): Promise<boolean> {
    const newDate = getNewDate(this.options.pattern);

    // 优先处理日期变更
    if (newDate !== this.currentDate) {
      this.newDate = newDate;
      return true;
    }

    // 其次检查文件大小
    const { maxSize } = this.options;
    return maxSize > 0 && maxSize <= this.currentSize;
  }

  protected async rotateFiles(): Promise<void> {
    const { options: { backups, compress }, currentDate, newDate } = this;
    const isDateChanged = currentDate !== newDate;
    let date: string;

    if (isDateChanged) {
      date = newDate;
    }
    else {
      date = currentDate;

      // 从高索引向低索引移动，避免覆盖
      for (let i = backups - 1; i >= 1; i--) {
        await moveFile(
          this.getRollingFilePath(date, i),
          this.getRollingFilePath(date, i + 1),
          compress
        );
      }
    }

    // 移动当前文件到 .1
    await moveFile(
      this.filePath,
      this.getRollingFilePath(date, 1),
      compress
    );

    this.currentDate = newDate;
  }

  protected async getOldFiles(): Promise<string[]> {
    const { options: { backups }, parsedFilePath: { dir }, filePattern } = this;
    const files = await readdir(dir);

    return files
      .reduce((acc, file) => {
        const match = filePattern.exec(file);
        if (match) {
          acc.push([
            match.slice(1, -1).map((v) => +v),
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

    // 基础文件名部分
    let fullPath = join(dir, name);

    // 扩展名位置处理
    if (keepFileExt) {
      // 格式：{name}.{date}.{index}{ext}
      fullPath += fileNameSep + date;
      if (index > 0) {
        fullPath += fileNameSep + index;
      }
      fullPath += ext;
    }
    else {
      // 格式：{name}{ext}.{date}.{index}
      fullPath += ext + fileNameSep + date;
      if (index > 0) {
        fullPath += fileNameSep + index;
      }
    }

    return fullPath;
  }
}
