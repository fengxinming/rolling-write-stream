import { WritableOptions } from 'node:stream';

export type RollingOptions = WritableOptions & {
  maxSize: number; // File size threshold to trigger rolling (in bytes). Default: 0 (disabled)
  backups: number; // Number of backup files to keep. Default: 1
  compress: boolean; // Whether to compress backup files. Default: false
  encoding: BufferEncoding; // File encoding. Default: 'utf8'
  mode: number; // File mode (permissions). Default: 0o600
  flags: string; // File system flags. Default: 'a' (append)
  keepFileExt: boolean; // Keep file extension in backup names. Default: false
  fileNameSep: string; // Separator for backup filenames. Default: '.'
  useLock: boolean; // Enable file lock for multi-process safety. Default: false
  syncThreshold: number; // Data size threshold to trigger fsync (bytes). Default: 0
  syncInterval: number; // Time interval to trigger fsync (ms). Default: 10000
};

export type DateRollingOptions = RollingOptions & {
  pattern: string; // Date pattern for rolling (e.g., 'YYYY-MM-DD')
};
