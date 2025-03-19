# rolling-write-stream

[![npm package](https://nodei.co/npm/rolling-write-stream.png?downloads=true&downloadRank=true&stars=true)](https://www.npmjs.com/package/rolling-write-stream)
[![NPM version](https://img.shields.io/npm/v/rolling-write-stream.svg?style=flat)](https://npmjs.org/package/rolling-write-stream)
[![NPM Downloads](https://img.shields.io/npm/dm/rolling-write-stream.svg?style=flat)](https://npmjs.org/package/rolling-write-stream)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A high-performance Node.js log rolling library supporting size-based and date-based rolling, with compression backup and multi-process safety.

## [中文](README_zh-CN) | English

## Features

- 📁 **Dual Mode Rolling**: Support automatic rolling by file size or date
- 🔒 **Multi-process Safe**: Optional file lock to prevent concurrent writes
- 🗜️ **Compression Backup**: Gzip compression for historical logs
- ⚡ **High-performance**: Async I/O and backpressure management
- 📊 **Flexible Configuration**: Customizable rolling strategy, filename format and sync policy

## Installation

```bash
npm install rolling-log-stream
```

## Quick Start

### Rolling by Size
```typescript
import { FileStream } from 'rolling-log-stream';

const logger = new FileStream('./logs/app.log', {
  maxSize: 1024 * 1024, // Roll when reaching 1MB
  backups: 5,           // Keep 5 backups
  compress: true        // Compress old files
});

logger.write('This is a log entry\n');
```

### Rolling by Date
```typescript
import { DateFileStream } from 'rolling-log-stream';

const dailyLogger = new DateFileStream('./logs/daily.log', {
  pattern: 'YYYY-MM-DD',  // Daily rolling
  maxSize: 512 * 1024,    // 512KB per file
  backups: 7              // Keep 7 days of logs
});

dailyLogger.write(`[${new Date().toISOString()}] System startup\n`);
```

## Configuration Options

### Common Options (RollingOptions)
| Parameter         | Type       | Default       | Description                          |
|-------------------|------------|---------------|--------------------------------------|
| maxSize           | number     | 0             | File size threshold (bytes) for rolling (0 to disable) |
| backups           | number     | 1             | Number of backup files to retain     |
| compress          | boolean    | false         | Enable compression for backups       |
| encoding          | string     | 'utf8'        | File encoding                        |
| keepFileExt       | boolean    | false         | Keep file extension in backup names  |
| fileNameSep       | string     | '.'           | Filename separator                   |
| useLock           | boolean    | false         | Enable multi-process file lock       |
| syncThreshold     | number     | 0             | Data threshold (bytes) for forced sync |
| syncInterval      | number     | 10000         | Time interval (ms) for periodic sync  |

### Date Rolling Options (DateRollingOptions)
| Parameter | Type   | Default       | Description                          |
|-----------|--------|---------------|--------------------------------------|
| pattern   | string | 'YYYY-MM-DD'  | Date format (using date-manip syntax) |

## API Reference

### FileStream
- `new FileStream(filePath: string, options?: Partial<RollingOptions>)`
- Methods:
  - `write(chunk: string|Buffer): Promise<void>`
  - `end(): Promise<void>`

### DateFileStream
- `new DateFileStream(filePath: string, options?: Partial<DateRollingOptions>)`
- Methods same as FileStream

## Advanced Examples

### Production Configuration
```typescript
const prodLogger = new DateFileStream('/var/log/myapp/prod.log', {
  pattern: 'YYYYMMDD',
  maxSize: 50 * 1024 * 1024,  // 50MB per file
  backups: 9,                 // Keep 9 daily backups
  compress: true,
  useLock: true,              // Enable file lock
  syncThreshold: 1024 * 1024  // Force sync every 1MB
});
```

### Custom Filename Format
```typescript
const customLogger = new FileStream('./logs/data.log', {
  keepFileExt: true,          // Generate names like data.1.log
  fileNameSep: '_',           // Use underscore separator
  backups: 10
});
```

## Running Tests

### Unit Tests
```bash
npm test
```

### Performance Tests
```bash
npm run stress
```

## Contribution Guide

Contributions are welcome via Issues and Pull Requests!  
Development workflow:
1. Fork the repository
2. Create feature/fix branches (e.g., feat/xxx or fix/xxx)
3. Commit code with tests
4. Create Pull Request

## License

[MIT License](LICENSE)
