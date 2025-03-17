export interface RollingOptions {
  maxSize: number;
  backups: number;
  compress: boolean;
  encoding: BufferEncoding;
  mode: number;
  flags: string;
  keepFileExt: boolean;
  fileNameSep: string;
}

export interface DateRollingOptions extends RollingOptions {
  pattern: string;
}
