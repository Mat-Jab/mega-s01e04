import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const good = [
  { at: '2026-10-28T01:00:00+01:00', job: 'lane/sync', status: 'ok', owner: 'rig' },
  { at: '2026-10-28T02:00:00+01:00', job: 'digest/render', status: 'fail', owner: null, error: 'boom' },
];

let runsDir: string;

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  writeFileSync(join(runsDir, '2026-10-28.jsonl'), good.map((l) => JSON.stringify(l)).join('\n') + '\n');
  writeFileSync(join(runsDir, '2026-10-26.jsonl'), '');
  writeFileSync(
    join(runsDir, '2026-10-25.jsonl'),
    [JSON.stringify(good[0]), 'not json at all', JSON.stringify(good[1])].join('\n') + '\n',
  );
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

const config = () => ({
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir,
});

describe('GET /digest/:night', () => {
  it('200 for a normal night, lists the jobs', async () => {
    const res = await createApp(config()).request('/digest/2026-10-28');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('digest 2026-10-28');
    expect(html).toContain('lane/sync');
    expect(html).toContain('digest/render');
  });

  it('404 for a night with no file', async () => {
    const res = await createApp(config()).request('/digest/2026-01-01');
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('no run log for this night');
  });

  it('200 for an empty night, says nothing ran', async () => {
    const res = await createApp(config()).request('/digest/2026-10-26');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('200 with a bad line, still lists the good jobs and notes the skipped line', async () => {
    const res = await createApp(config()).request('/digest/2026-10-25');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('lane/sync');
    expect(html).toContain('digest/render');
    expect(html).toContain('1 bad line skipped');
  });
});

describe('GET /api/digest/:night', () => {
  it('200 for a normal night, rows for each job', async () => {
    const res = await createApp(config()).request('/api/digest/2026-10-28');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { night: string; rows: { job: string }[]; badLines: number };
    expect(body.night).toBe('2026-10-28');
    expect(body.rows.map((r) => r.job)).toEqual(['digest/render', 'lane/sync']);
    expect(body.badLines).toBe(0);
  });

  it('404 for a night with no file', async () => {
    const res = await createApp(config()).request('/api/digest/2026-01-01');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no such night' });
  });

  it('200 for an empty night, rows []', async () => {
    const res = await createApp(config()).request('/api/digest/2026-10-26');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ night: '2026-10-26', rows: [], badLines: 0 });
  });

  it('200 with a bad line, badLines 1 and the good jobs still listed', async () => {
    const res = await createApp(config()).request('/api/digest/2026-10-25');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: { job: string }[]; badLines: number };
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['digest/render', 'lane/sync']);
  });
});

describe('page and JSON agree', () => {
  it('list the same jobs in the same order', async () => {
    const app = createApp(config());
    const html = await (await app.request('/digest/2026-10-28')).text();
    const json = (await (await app.request('/api/digest/2026-10-28')).json()) as { rows: { job: string }[] };
    const positions = json.rows.map((r) => html.indexOf(`<td>${r.job}</td>`));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});
