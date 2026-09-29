// Runs every data source server-side and writes public/data/snapshot.json for the Pages build.
// Usage: npm run snapshot   (PREVIOUS_SNAPSHOT_URL is set by the deploy workflow)
import { mkdir, writeFile } from 'node:fs/promises';
import { collectSnapshot } from '../src/lib/status.ts';

const out = new URL('../public/data/snapshot.json', import.meta.url);
const snap = await collectSnapshot();

// A source that failed this run keeps the last good value from the live site, with its original
// timestamp, so the dashboard shows it as stale rather than blank.
const previousUrl = process.env.PREVIOUS_SNAPSHOT_URL;
if (previousUrl) {
  try {
    const res = await fetch(previousUrl, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const prev = await res.json();
    for (const [id, result] of Object.entries(snap.sources)) {
      const old = prev?.sources?.[id];
      if (!result.ok && old?.data) snap.sources[id] = { ...result, data: old.data, fetchedAt: old.fetchedAt };
    }
  } catch (e) {
    console.warn(`previous snapshot not used: ${e.message}`);
  }
}

await mkdir(new URL('.', out), { recursive: true });
await writeFile(out, JSON.stringify(snap));

for (const [id, r] of Object.entries(snap.sources)) {
  const state = r.ok ? 'ok  ' : r.data ? 'kept' : 'FAIL';
  console.log(`${state}  ${id.padEnd(13)}${r.ok ? '' : r.error}`);
}
