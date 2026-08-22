import { cp, mkdir, rm } from 'node:fs/promises';

const outputDirectory = new URL('../dist/', import.meta.url);
await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  ...['index.html', 'hospitals.html', 'register.html', 'admin.html'].map((file) => cp(new URL(`../${file}`, import.meta.url), new URL(file, outputDirectory))),
  rm(new URL('assets/', outputDirectory), { recursive: true, force: true }).then(() => cp(new URL('../assets/', import.meta.url), new URL('assets/', outputDirectory), { recursive: true })),
]);
