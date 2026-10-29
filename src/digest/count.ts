import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseLine } from './read.js';

export type NightCounts = { ok: number; retry: number; fail: number };

// Per run line, not per job. Unparseable lines and unreadable files count as nothing.
export function countNight(runsDir: string, night: string): NightCounts {
  const counts: NightCounts = { ok: 0, retry: 0, fail: 0 };
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch {
    return counts;
  }
  for (const t of text.split('\n')) {
    if (t.trim() === '') continue;
    const l = parseLine(t);
    if (l) counts[l.status] += 1;
  }
  return counts;
}
