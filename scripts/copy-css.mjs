import { copyFile } from 'node:fs/promises';
await copyFile('src/styles.css', 'dist/styles.css');
