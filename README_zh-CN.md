# rolling-write-stream

[![npm package](https://nodei.co/npm/rolling-write-stream.png?downloads=true&downloadRank=true&stars=true)](https://www.npmjs.com/package/rolling-write-stream)
[![NPM version](https://img.shields.io/npm/v/rolling-write-stream.svg?style=flat)](https://npmjs.org/package/rolling-write-stream)
[![NPM Downloads](https://img.shields.io/npm/dm/rolling-write-stream.svg?style=flat)](https://npmjs.org/package/rolling-write-stream)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> 一个高性能的Node.js日志滚动库，支持按文件大小和日期滚动，提供压缩备份和多进程安全锁。

## 中文 | [English](README.md)

## 功能特性

- 📁 **双模式滚动**：支持按文件大小或日期自动滚动日志
- 🔒 **多进程安全**：可选文件锁防止多进程写入冲突
- 🗜️ **压缩备份**：支持gzip压缩历史日志文件
- ⚡ **高性能设计**：异步I/O操作和背压管理
- 📊 **灵活配置**：可定制滚动策略、文件名格式和同步策略

## 安装

```bash
npm install rolling-log-stream
```

## 快速开始

### 按大小滚动日志
```typescript
import { FileStream } from 'rolling-log-stream';

const logger = new FileStream('./logs/app.log', {
  maxSize: 1024 * 1024, // 1MB触发滚动
  backups: 5,           // 保留5个备份
  compress: true        // 压缩历史文件
});

logger.write('这是一条日志内容\n');
```

### 按日期滚动日志
```typescript
import { DateFileStream } from 'rolling-log-stream';

const dailyLogger = new DateFileStream('./logs/daily.log', {
  pattern: 'YYYY-MM-DD',  // 每日滚动
  maxSize: 512 * 1024,    // 单文件最大512KB
  backups: 7              // 保留7天日志
});

dailyLogger.write(`[${new Date().toISOString()}] 系统启动\n`);
```

## 配置选项

### 通用配置 (RollingOptions)
| 参数            | 类型       | 默认值       | 说明                          |
|-----------------|------------|--------------|-------------------------------|
| maxSize         | number     | 0            | 滚动文件大小（字节），0表示禁用 |
| backups         | number     | 1            | 保留的备份文件数量            |
| compress        | boolean    | false        | 是否压缩备份文件              |
| encoding        | string     | 'utf8'       | 文件编码                      |
| keepFileExt     | boolean    | false        | 是否在备份名中保留文件扩展名  |
| fileNameSep     | string     | '.'          | 文件名分隔符                  |
| useLock         | boolean    | false        | 启用多进程文件锁              |
| syncThreshold   | number     | 0            | 触发同步的数据量阈值（字节）  |
| syncInterval    | number     | 10000        | 触发同步的时间间隔（毫秒）    |

### 日期滚动专属配置 (DateRollingOptions)
| 参数     | 类型   | 默认值       | 说明                          |
|----------|--------|--------------|-------------------------------|
| pattern  | string | 'YYYY-MM-DD' | 日期格式（使用date-manip语法） |

## API 文档

### FileStream
- `new FileStream(filePath: string, options?: Partial<RollingOptions>)`
- 方法：
  - `write(chunk: string|Buffer): Promise<void>`
  - `end(): Promise<void>`

### DateFileStream
- `new DateFileStream(filePath: string, options?: Partial<DateRollingOptions>)`
- 方法同FileStream

## 高级示例

### 生产环境配置
```typescript
const prodLogger = new DateFileStream('/var/log/myapp/prod.log', {
  pattern: 'YYYYMMDD',
  maxSize: 50 * 1024 * 1024,  // 50MB
  backups: 9,                 // 单日最大备份数为9
  compress: true,
  useLock: true,              // 启用多进程锁
  syncThreshold: 1024 * 1024  // 每1MB强制刷盘
});
```

### 自定义文件名格式
```typescript
const customLogger = new FileStream('./logs/data.log', {
  keepFileExt: true,          // 生成 data.1.log 格式
  fileNameSep: '_',           // 使用下划线分隔
  backups: 10
});
```

## 运行测试

### 单元测试
```bash
npm test
```

### 性能测试
```bash
npm run stress
```

## 贡献指南

欢迎通过Issue和PR参与贡献！  
开发流程：
1. Fork仓库
2. 创建特性分支（feat/xxx 或 fix/xxx）
3. 提交代码并添加测试
4. 创建Pull Request

## 许可证

[MIT License](LICENSE)