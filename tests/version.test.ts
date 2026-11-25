import pkg from '../package.json';
import readme from '../README.md?raw';
import { VERSION_LABEL, versionLabel } from '../src/config/version';

test('the title screen label is built from the package version', () => {
  expect(versionLabel('0.2.2-alpha')).toBe('V0.2.2 ALPHA');
  expect(versionLabel('1.0.0')).toBe('V1.0.0');
  expect(VERSION_LABEL).toBe(versionLabel(pkg.version));
});

test('the newest README history entry is the current version', () => {
  const newest = /^### (\S+)/m.exec(readme.split('## Version history')[1] ?? '')?.[1];
  expect(newest).toBe(pkg.version);
});
