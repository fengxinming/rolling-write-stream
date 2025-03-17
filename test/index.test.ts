import path from 'node:path';

import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DateRollingFileStream, RollingFileStream } from '../src';

const TEST_DIR = path.resolve('logs');

// 辅助函数
async function getFileCount(dir: string) {
  return (await fs.readdir(dir)).length;
}

async function getFileSize(filePath: string) {
  return (await fs.stat(filePath)).size;
}

function fileNameSort(a: string, b: string) {
  // 提取文件名中的数字部分（若无数字则默认为0）
  const numA = (a.match(/\d+/g) || [0]).map(Number)[0];
  const numB = (b.match(/\d+/g) || [0]).map(Number)[0];
  return numA - numB;
}

const dateFileNameSort = (a: string, b: string) => {
  // 使用正则提取日期和序号
  const pattern = /(\d{4}-\d{2}-\d{2})\.(\d+)/;

  const aMatch = pattern.exec(a);
  const bMatch = pattern.exec(b);

  // 格式错误项置后
  if (!aMatch || !bMatch) {
    return !aMatch ? -1 : 1;
  }

  // 解析日期为数字数组 [年, 月, 日]
  const parseDate = (dateStr: string) =>
    dateStr.split('-').map(Number) as [number, number, number];

  // 比较日期（降序）
  const aDate = parseDate(aMatch[1]);
  const bDate = parseDate(bMatch[1]);

  // 比较年份
  if (aDate[0] !== bDate[0]) {
    return bDate[0] - aDate[0];
  }
  // 比较月份
  if (aDate[1] !== bDate[1]) {
    return bDate[1] - aDate[1];
  }
  // 比较日期
  if (aDate[2] !== bDate[2]) {
    return bDate[2] - aDate[2];
  }

  // 日期相同时比较序号（升序）
  return parseInt(aMatch[2], 10) - parseInt(bMatch[2], 10);
};

beforeEach(async () => {
  await fs.emptyDir(TEST_DIR);
});

afterEach(async () => {
  await fs.remove(TEST_DIR);
});

describe('RollingFileStream', () => {
  it('应该创建初始文件并写入内容', async () => {
    const filePath = path.join(TEST_DIR, 'test.log');
    const stream = new RollingFileStream(filePath, { maxSize: 1024 });

    await new Promise((resolve) => {
      stream.write('test data', resolve);
    });
    await new Promise((resolve) => {
      stream.end(resolve);
    });

    expect(await fs.pathExists(filePath)).toBe(true);
    expect(await getFileSize(filePath)).toBe(9); // 'test data'.length
  });

  it('达到大小时应滚动文件', async () => {
    const filePath = path.join(TEST_DIR, 'roll-test.log');
    const stream = new RollingFileStream(filePath, {
      maxSize: 10,
      backups: 2,
      keepFileExt: true
    });

    // 第一次写入15字节（未触发滚动，因为写入前currentSize=0 < maxSize=10）
    await new Promise<void>((resolve, reject) => {
      stream.write(Buffer.alloc(15), (err) => (err ? reject(err) : resolve()));
    });

    // 第二次写入1字节（触发滚动，因为currentSize=15 > maxSize=10）
    await new Promise<void>((resolve, reject) => {
      stream.write(Buffer.alloc(1), (err) => (err ? reject(err) : resolve()));
    });

    // 验证滚动已触发
    let files = await fs.readdir(TEST_DIR);
    expect(files.sort(fileNameSort)).toEqual([
      'roll-test.log', // 新创建的空文件（currentSize重置为0）
      'roll-test.1.log' // 原始内容滚动后的文件（15字节）
    ]);

    // 第三次写入5字节（新文件当前大小=5 < maxSize）
    await new Promise<void>((resolve, reject) => {
      stream.write(Buffer.alloc(5), (err) => (err ? reject(err) : resolve()));
    });
    await new Promise<void>((resolve) => {
      stream.end(resolve);
    });

    // 最终文件列表验证
    files = await fs.readdir(TEST_DIR);
    expect(files.sort(fileNameSort)).toEqual([
      'roll-test.log', // 当前文件（5字节）
      'roll-test.1.log' // 第一次滚动备份（15字节）
    ]);
  });

  it('应正确处理压缩', async () => {
    const filePath = path.join(TEST_DIR, 'compress-test.log');
    const stream = new RollingFileStream(filePath, {
      maxSize: 10,
      backups: 1,
      compress: true,
      keepFileExt: true
    });

    await new Promise((resolve) => {
      stream.write(Buffer.alloc(15), resolve);
    });
    await new Promise((resolve) => {
      stream.write(Buffer.alloc(1), resolve);
    });
    await new Promise((resolve) => {
      stream.end(resolve);
    });

    const files = await fs.readdir(TEST_DIR);
    expect(files).toContain('compress-test.1.log.gz');
  });

  it('应保留正确数量的备份文件', async () => {
    const filePath = path.join(TEST_DIR, 'backup-test.log');
    const stream = new RollingFileStream(filePath, {
      maxSize: 10,
      backups: 3
    });

    // 触发4次滚动
    for (let i = 0; i < 4; i++) {
      await new Promise((resolve) => {
        stream.write(Buffer.alloc(15), resolve);
      });
    }
    await new Promise((resolve) => {
      stream.end(resolve);
    });

    const files = await fs.readdir(TEST_DIR);
    expect(files).toHaveLength(4); // 3备份 + 当前文件
  });

  it('backups=0时应删除所有旧文件', async () => {
    const filePath = path.join(TEST_DIR, 'no-backup-test.log');
    const stream = new RollingFileStream(filePath, {
      maxSize: 10,
      backups: 0
    });

    // 触发多次滚动
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => {
        stream.write(Buffer.alloc(15), resolve);
      });
    }
    await new Promise((resolve) => {
      stream.end(resolve);
    });

    const files = await fs.readdir(TEST_DIR);
    expect(files).toHaveLength(1); // 只保留当前文件
  });

  it('maxSize=0时应禁用大小滚动', async () => {
    const filePath = path.join(TEST_DIR, 'no-size-roll-test.log');
    const stream = new RollingFileStream(filePath, {
      maxSize: 0,
      backups: 2
    });

    await new Promise((resolve) => {
      stream.write(Buffer.alloc(1024 * 1024), resolve);
    });
    await new Promise((resolve) => {
      stream.write(Buffer.alloc(1024), resolve);
    });
    await new Promise((resolve) => {
      stream.end(resolve);
    });

    expect(await getFileCount(TEST_DIR)).toBe(1);
  });
});

describe('DateRollingFileStream', () => {
  let mockDate: Date;

  beforeEach(() => {
    mockDate = new Date(2023, 0, 1, 12, 0, 0);
    vi.useFakeTimers();
    vi.setSystemTime(mockDate);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('应按日期格式创建文件', async () => {
    const filePath = path.join(TEST_DIR, 'date-test.log');
    const stream = new DateRollingFileStream(filePath, {
      pattern: 'YYYY-MM-DD'
    });

    await new Promise((resolve) => {
      stream.write('test data', resolve);
    });
    await new Promise((resolve) => {
      stream.end(resolve);
    });
    expect(await fs.pathExists(filePath)).toBe(true);
    expect(await getFileSize(filePath)).toBe(9); // 'test data'.length
  });

  it('日期变化时应滚动文件', async () => {
    const filePath = path.join(TEST_DIR, 'daily-test.log');
    const stream = new DateRollingFileStream(filePath, {
      pattern: 'YYYY-MM-DD',
      keepFileExt: true
    });

    // 第一天写入 daily-test.log
    await new Promise((resolve) => {
      stream.write('day1', resolve);
    });

    // 快进到第二天
    mockDate.setDate(mockDate.getDate() + 1);
    vi.advanceTimersByTime(24 * 3600 * 1000);

    // 第二天写入 daily-test.log, daily-test.2023-01-02.1.log
    await new Promise((resolve) => {
      stream.write('day2', resolve);
    });

    // 快进到第三天
    mockDate.setDate(mockDate.getDate() + 1);
    vi.advanceTimersByTime(24 * 3600 * 1000);

    // 第三天写入 daily-test.log, daily-test.2023-01-03.1.log, daily-test.2023-01-02.1.log
    await new Promise((resolve) => {
      stream.write('day3', resolve);
    });

    await new Promise((resolve) => {
      stream.end(resolve);
    });

    const files = (await fs.readdir(TEST_DIR)).sort(dateFileNameSort);
    expect(files).toEqual([
      'daily-test.log',
      'daily-test.2023-01-03.1.log',
      'daily-test.2023-01-02.1.log'
    ]);
  });

  it('应同时处理日期和大小滚动', async () => {
    const filePath = path.join(TEST_DIR, 'combined-test.log');
    const stream = new DateRollingFileStream(filePath, {
      pattern: 'YYYY-MM-DD',
      maxSize: 10, // 10字节触发大小滚动
      backups: 2
    });

    // --- 第一天 ---
    // 写入15字节（触发大小滚动）
    await new Promise((resolve) => {
      stream.write(Buffer.alloc(15), resolve);
    });
    await new Promise((resolve) => {
      stream.write(Buffer.alloc(1), resolve);
    });

    // 验证第一天备份
    let files = await fs.readdir(TEST_DIR);
    expect(files.sort(dateFileNameSort)).toEqual([
      'combined-test.log', // 当前文件（1字节）
      'combined-test.log.2023-01-01.1' // 大小滚动备份（15字节）
    ]);

    // --- 第二天 ---
    mockDate.setDate(mockDate.getDate() + 1);
    vi.advanceTimersByTime(24 * 3600 * 1000);

    // 写入15字节（触发日期滚动 + 大小滚动）
    await new Promise((resolve) => {
      stream.write(Buffer.alloc(15), resolve);
    });

    await new Promise((resolve) => {
      stream.end(resolve);
    });

    // 验证最终文件
    files = await fs.readdir(TEST_DIR);
    expect(files.sort(dateFileNameSort)).toEqual([
      'combined-test.log', // 第二天当前文件
      'combined-test.log.2023-01-02.1', // 第二天大小备份
      'combined-test.log.2023-01-01.1' // 第一天备份
    ]);
  });

  it('应正确处理带压缩的日期文件', async () => {
    const filePath = path.join(TEST_DIR, 'compress-date-test.log');
    const stream = new DateRollingFileStream(filePath, {
      pattern: 'YYYY-MM-DD',
      maxSize: 10,
      compress: true
    });

    await new Promise((resolve) => {
      stream.write('compress-date', resolve);
    });
    await new Promise((resolve) => {
      stream.write('compress-date2', resolve);
    });
    mockDate.setDate(mockDate.getDate() + 1);
    vi.advanceTimersByTime(24 * 3600 * 1000);
    await new Promise((resolve) => {
      stream.end(resolve);
    });

    const files = await fs.readdir(TEST_DIR);
    expect(files).toContain('compress-date-test.log.2023-01-01.1.gz');
  });

  it('backups=0时应删除所有旧文件', async () => {
    const filePath = path.join(TEST_DIR, 'no-backup-test.log');
    const stream = new DateRollingFileStream(filePath, {
      maxSize: 10,
      backups: 0
    });

    // 触发多次滚动
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => {
        stream.write(Buffer.alloc(15), resolve);
      });
    }
    await new Promise((resolve) => {
      stream.end(resolve);
    });

    const files = await fs.readdir(TEST_DIR);
    expect(files).toHaveLength(1); // 只保留当前文件
  });

  it('maxSize=0时应禁用大小滚动', async () => {
    const filePath = path.join(TEST_DIR, 'no-size-roll-test.log');
    const stream = new DateRollingFileStream(filePath, {
      maxSize: 0,
      backups: 2
    });

    await new Promise((resolve) => {
      stream.write(Buffer.alloc(1024 * 1024), resolve);
    });
    await new Promise((resolve) => {
      stream.write(Buffer.alloc(1024), resolve);
    });
    await new Promise((resolve) => {
      stream.end(resolve);
    });

    expect(await getFileCount(TEST_DIR)).toBe(1);
  });
});
