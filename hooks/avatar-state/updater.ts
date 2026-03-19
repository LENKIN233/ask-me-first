import { StateDetector } from '../../src/state/detector.js';
import { IdentityResolver } from '../../src/identity/resolver.js';

let _timer: ReturnType<typeof setInterval> | null = null;
let _lastDecay = 0;
const DECAY_INTERVAL_MS = 60 * 60 * 1000;

async function refreshState(workspaceDir: string): Promise<void> {
  const detector = new StateDetector({
    enablePresence: true,
    enableCalendar: false,
    calendarLookaheadHours: 1,
    cacheTTL: 10 * 60 * 1000
  });

  try {
    const state = await detector.refresh();
    const outPath = require('path').join(workspaceDir, 'ask_me_first/avatar_state.json');
    const fs = require('fs');

    let existing: any = {};
    if (fs.existsSync(outPath)) {
      try { existing = JSON.parse(fs.readFileSync(outPath, 'utf-8')); } catch { }
    }

    if (existing.explicit && existing.explicitSetAt) {
      const elapsed = Date.now() - new Date(existing.explicitSetAt).getTime();
      if (elapsed < 4 * 60 * 60 * 1000) {
        console.log('[avatar-state] explicit state active, skipping auto-refresh');
        return;
      }
    }

    fs.writeFileSync(outPath, JSON.stringify({
      ...state,
      updatedAt: new Date().toISOString()
    }, null, 2));
    console.log('[avatar-state] refreshed:', state.availability, state.current_mode);
  } catch (e) {
    console.error('[avatar-state] refresh failed:', e);
  }
}

async function maybeDecayTrust(workspaceDir: string): Promise<void> {
  const now = Date.now();
  if (now - _lastDecay < DECAY_INTERVAL_MS) return;
  _lastDecay = now;

  try {
    const resolver = new IdentityResolver(workspaceDir);
    await resolver.decayTrustScores();
    console.log('[avatar-state] trust decay check complete');
  } catch (e) {
    console.error('[avatar-state] trust decay failed:', e);
  }
}

export default async function handler(event: any): Promise<void> {
  const workspaceDir = process.env.OPENCLAW_WORKSPACE || process.cwd();

  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }

  await refreshState(workspaceDir);

  _timer = setInterval(() => {
    refreshState(workspaceDir).catch(() => {});
    maybeDecayTrust(workspaceDir).catch(() => {});
  }, 10 * 60 * 1000);

  console.log('[avatar-state] timer started (10min interval)');
}
