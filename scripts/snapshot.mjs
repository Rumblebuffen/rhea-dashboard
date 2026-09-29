// Runs every data source server-side and writes public/data/snapshot.json for the Pages build.
// Usage: npm run snapshot   (PREVIOUS_SNAPSHOT_URL is set by the deploy workflow)
import { mkdir, writeFile } from 'node:fs/promises';
import { collectSnapshot } from '../src/lib/status.ts';

const out = new URL('../public/data/snapshot.json', import.meta.url);
const startedAt = Date.now();

// The live site's snapshot lets daily sources skip refetching and failed sources keep their last value.
let previous = null;
const previousUrl = process.env.PREVIOUS_SNAPSHOT_URL;
if (previousUrl) {
  try {
    const res = await fetch(`${previousUrl}?t=${startedAt}`, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    previous = await res.json();
  } catch (e) {
    console.warn(`previous snapshot not used: ${e.message}`);
  }
}

const snap = await collectSnapshot(previous);

// A source that failed this run keeps its last good value, with the original timestamp, so the
// dashboard shows it as stale rather than blank.
for (const [id, result] of Object.entries(snap.sources)) {
  const old = previous?.sources?.[id];
  if (!result.ok && old?.data) snap.sources[id] = { ...result, data: old.data, fetchedAt: old.fetchedAt };
}

await mkdir(new URL('.', out), { recursive: true });
await writeFile(out, JSON.stringify(snap));

for (const [id, r] of Object.entries(snap.sources)) {
  const state = r.ok ? (r.fetchedAt < startedAt ? 'reuse' : 'ok   ') : r.data ? 'kept ' : 'FAIL ';
  console.log(`${state} ${id.padEnd(13)}${r.ok ? '' : r.error}`);
}
console.log(`snapshot took ${Math.round((Date.now() - startedAt) / 1000)}s`);
