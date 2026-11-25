import { version } from '../../package.json';

/** "0.2.2-alpha" -> "V0.2.2 ALPHA". The number itself lives in package.json. */
export function versionLabel(v: string): string {
  const [number, stage] = v.split('-');
  return stage ? `V${number} ${stage.toUpperCase()}` : `V${number}`;
}

export const VERSION_LABEL = versionLabel(version);
