// Token speed estimation shared by the TUI and GUI parts.
//
// Providers do not report token counts while streaming, so the live rate is
// estimated from streamed characters over a short sliding window at roughly
// 4 characters per token. The estimate is smoothed with an EMA and expires to
// 0 once the stream goes quiet.
//
// Everything here is framework-free so both UI processes can use it unchanged.

const CHARS_PER_TOKEN = 4;
/** Sliding window for the instantaneous rate, in ms. */
const WINDOW_MS = 2000;
/** Without new deltas for this long, the stream counts as idle. */
const IDLE_MS = 1500;
/** Minimum window span before a rate is computed, in ms. */
const MIN_SPAN_MS = 300;

export interface SpeedSnapshot {
  /** Estimated output tokens per second; 0 when not streaming. */
  readonly speed: number;
  /** Time from step start to the first streamed token, in ms. */
  readonly ttft: number | null;
  /** The agent is working on this session, including steps without output. */
  readonly busy: boolean;
}

interface StepState {
  startedAt: number | null;
  ttft: number | null;
  totalChars: number;
  samples: [number, number][];
  lastDeltaAt: number;
  speed: number;
}

function freshStep(): StepState {
  return { startedAt: null, ttft: null, totalChars: 0, samples: [], lastDeltaAt: 0, speed: 0 };
}

function updateRate(step: StepState, now: number): void {
  // A gap longer than the window means the old samples describe a past burst;
  // restart the window on the current delta instead of diluting the rate.
  if (step.samples.length > 1 && now - step.samples[0][0] > WINDOW_MS) step.samples.length = 0;
  step.samples.push([now, step.totalChars]);
  while (step.samples.length > 2 && now - step.samples[0][0] > WINDOW_MS) step.samples.shift();

  const [t0, c0] = step.samples[0];
  const span = now - t0;
  if (span < MIN_SPAN_MS) return;
  const instantaneous = (((step.totalChars - c0) / span) * 1000) / CHARS_PER_TOKEN;
  step.speed = step.speed ? step.speed * 0.6 + instantaneous * 0.4 : instantaneous;
}

export class SpeedTracker {
  private steps = new Map<string, StepState>();
  private busy = new Set<string>();

  /**
   * Feeds one server event. Returns the session whose snapshot may have
   * changed, or null for events the tracker ignores.
   */
  onEvent(event: { type: string; created?: number; data?: unknown }): string | null {
    const data = event.data as { sessionID?: string; delta?: string } | undefined;
    if (!data?.sessionID) return null;
    const now = event.created ?? Date.now();
    const sessionID = data.sessionID;

    switch (event.type) {
      // An execution is one turn of the agent loop, so these bracket exactly
      // the span the indicator stays visible for. The host derives its own
      // running state from the same events.
      case "session.execution.started": {
        this.busy.add(sessionID);
        return sessionID;
      }
      case "session.execution.succeeded":
      case "session.execution.failed":
      case "session.execution.interrupted": {
        this.busy.delete(sessionID);
        // The turn is over: drop the last step so its rate or TTFT cannot
        // reappear as stale data before the next turn's first delta.
        this.steps.set(sessionID, freshStep());
        return sessionID;
      }
      case "session.step.started": {
        // Step events also mark the session busy, so a turn already running
        // when the plugin loads still shows.
        this.busy.add(sessionID);
        const step = freshStep();
        step.startedAt = now;
        this.steps.set(sessionID, step);
        return sessionID;
      }
      case "session.step.first-token": {
        const step = this.steps.get(sessionID);
        if (!step) return null;
        if (step.startedAt !== null) step.ttft = now - step.startedAt;
        return sessionID;
      }
      case "session.step.ended":
      case "session.step.failed": {
        // Keep the last step's ttft visible, but the stream is over.
        const step = this.steps.get(sessionID) ?? freshStep();
        this.steps.set(sessionID, { ...freshStep(), startedAt: null, ttft: step.ttft });
        return sessionID;
      }
      case "session.text.delta":
      case "session.reasoning.delta":
      case "session.tool.input.delta": {
        const delta = data.delta;
        if (!delta) return null;
        this.busy.add(sessionID);
        const step = this.steps.get(sessionID) ?? freshStep();
        this.steps.set(sessionID, step);
        // First observed delta doubles as the first token when the
        // session.step.first-token event is unavailable.
        if (step.ttft === null && step.startedAt !== null) step.ttft = now - step.startedAt;
        step.totalChars += delta.length;
        step.lastDeltaAt = now;
        updateRate(step, now);
        return sessionID;
      }
      default:
        return null;
    }
  }

  /** Expires quiet streams to idle; returns the affected session ids. */
  tick(now: number): string[] {
    const changed: string[] = [];
    for (const [sessionID, step] of this.steps) {
      if (step.speed && now - step.lastDeltaAt > IDLE_MS) {
        step.speed = 0;
        step.samples.length = 0;
        changed.push(sessionID);
      }
    }
    return changed;
  }

  snapshot(sessionID: string): SpeedSnapshot {
    const step = this.steps.get(sessionID);
    const busy = this.busy.has(sessionID);
    if (!step) return { speed: 0, ttft: null, busy };
    return { speed: step.speed, ttft: step.ttft, busy };
  }
}
