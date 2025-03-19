import { createServer } from 'node:http';
import { dirname } from 'node:path';
import { Writable } from 'node:stream';

import autocannon from 'autocannon';
import { emptyDirSync } from 'fs-extra';

import FileStream from './src/FileStream';

const port = 6789;
const logFilePath = './logs/test.log';

async function test(): Promise<void> {
  const instance = autocannon({
    url: `http://localhost:${port}/log`,
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain'
    },
    body: 'test-log-data',
    connections: 250
  });

  autocannon.track(instance);
  await instance;
}

function createLogServer() {
  let logStream: Writable;

  const server = createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/log') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        // console.info(`Received POST request with body: ${body}`);

        // 写入日志（添加错误回调）
        logStream.write(`${body}\n`, (err) => {
          if (err) {
            console.error('日志写入失败:', err);
            res.statusCode = 500;
            res.end('Internal Server Error');
            return;
          }
          res.end('OK');
        });
      });
    }
    else {
      res.statusCode = 404;
      res.end('Not Found');
    }
  });

  // 全局错误处理
  process.on('uncaughtException', (err) => {
    console.error('未捕获的异常:', err);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('未处理的Promise拒绝:', promise, '原因:', reason);
  });

  server
    .listen(port, async () => {
      console.info(`Server is running on http://localhost:${port}`);
      console.info();

      // autocannon -c 200 -d 20 -m POST -H "Content-Type:text/plain" -b "test-log-data" http://localhost:${port}/log

      console.info('Test FileStream');
      logStream = new FileStream(logFilePath, {
        maxSize: 1024 * 1024,
        backups: 5
      });
      await test();
      emptyDirSync(dirname(logFilePath));

      console.info('\n-------------\n');
      process.exit(0);
    })
    .on('error', (err) => {
      console.error('服务器启动失败:', err);
      process.exit(1);
    });
}

createLogServer();
