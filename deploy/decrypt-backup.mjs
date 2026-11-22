#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createDecipheriv } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const [encryptedPath, outputPath] = process.argv.slice(2);

if (!encryptedPath || !outputPath) {
  console.error('Usage: node deploy/decrypt-backup.mjs <encrypted-file> <output-file>');
  process.exit(2);
}

const keychain = spawnSync(
  'security',
  [
    'find-generic-password',
    '-s',
    'com.cliqo.production-backup',
    '-a',
    'production-2026-11-07-final-v2',
    '-w',
  ],
  { encoding: 'utf8', timeout: 30_000 },
);

if (keychain.status !== 0) {
  if (keychain.error?.code === 'ETIMEDOUT') {
    console.error('Allow the macOS Keychain access prompt, then run the decrypt command again.');
    process.exit(1);
  }
  console.error('Could not read the CliQo backup key from Mac Keychain.');
  process.exit(1);
}

const keyHex = keychain.stdout.trim();
if (!/^[0-9a-f]{64}$/i.test(keyHex)) {
  console.error('The CliQo Keychain item has an invalid key format.');
  process.exit(1);
}

const key = Buffer.from(keyHex, 'hex');
const encrypted = await readFile(encryptedPath);
const magic = Buffer.from('CLIQOENC1', 'ascii');
const headerLength = magic.length + 12 + 16;

try {
  if (encrypted.length < headerLength || !encrypted.subarray(0, magic.length).equals(magic)) {
    throw new Error('invalid encrypted backup header');
  }

  const ivStart = magic.length;
  const tagStart = ivStart + 12;
  const decipher = createDecipheriv('aes-256-gcm', key, encrypted.subarray(ivStart, tagStart));
  decipher.setAuthTag(encrypted.subarray(tagStart, headerLength));

  const plaintext = Buffer.concat([
    decipher.update(encrypted.subarray(headerLength)),
    decipher.final(),
  ]);

  await writeFile(outputPath, plaintext, { mode: 0o600, flag: 'wx' });
  plaintext.fill(0);
  console.log('Decrypted and authenticated the CliQo backup.');
} catch {
  console.error('Backup authentication failed or output file already exists.');
  process.exitCode = 1;
} finally {
  key.fill(0);
}
