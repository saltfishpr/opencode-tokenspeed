import { createKeyed, Plugin, Slot, Style } from "@opencode/plugin/gui";
import { onCleanup, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { SpeedTracker, type SpeedSnapshot } from "./speed";

// WATCHED uses only event types that exist on both OpenCode 2.2.5 (Desktop)
// and 2.3.0 (CLI); TTFT is derived from the step's first delta, so the
// newer session.step.first-token event is not required.
const WATCHED = [
  "session.step.started",
  "session.step.ended",
  "session.step.failed",
  "session.text.delta",
  "session.reasoning.delta",
  "session.tool.input.delta",
] as const;

// Match the host indicator button styles in OpenCode Desktop; the SDK Button
// has no style prop.
const BUTTON_STYLE = `
  [data-component="button-v2"].tokenspeed-button {
    flex-shrink: 0;
    padding: 0 6px;
    color: var(--v2-text-text-faint);
  }
  .tokenspeed-button:active > span {
    color: var(--v2-text-text-muted);
  }
`;

export default Plugin.define({
  setup(ctx) {
    const tracker = new SpeedTracker();
    const [snapshots, setSnapshots] = createStore<Record<string, SpeedSnapshot>>({});
    const record = (sessionID: string) => setSnapshots(sessionID, tracker.snapshot(sessionID));

    // Subscribe on the current server's client and restart if the server
    // restarts, since ctx.client changes identity then.
    createKeyed(
      () => ctx.client,
      (client) => {
        const controller = new AbortController();
        void (async () => {
          for await (const event of client.event.subscribe({ types: [...WATCHED], signal: controller.signal })) {
            const sessionID = tracker.onEvent(event);
            if (sessionID) record(sessionID);
          }
        })().catch(() => {});
        onCleanup(() => controller.abort());
      },
    );

    const timer = setInterval(() => {
      for (const sessionID of tracker.tick(Date.now())) record(sessionID);
    }, 500);
    onCleanup(() => clearInterval(timer));

    ctx.add(Style, BUTTON_STYLE);
    ctx.add(Slot, {
      at: "session.header",
      order: 0,
      render(input) {
        const snap = () => (input.active ? snapshots[input.session.id] : undefined);
        return (
          <Show when={snap() && snap()!.speed > 0 ? snap() : undefined}>
            {(value) => (
              <ctx.ui.Tooltip
                placement="bottom"
                value={<span>First token {((value().ttft ?? 0) / 1000).toFixed(1)}s · estimated output</span>}
              >
                <ctx.ui.Button variant="ghost-muted" class="tokenspeed-button" size="small">
                  <span
                    style={{
                      display: "flex",
                      "align-items": "center",
                      gap: "8px",
                      "white-space": "nowrap",
                    }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.5"
                      aria-hidden="true"
                    >
                      <path d="M9 1.5 3.5 9h3.5l-1 5.5L11.5 7H8l1-5.5z" stroke-linejoin="round" />
                    </svg>
                    {label(value().speed, value().ttft)}
                  </span>
                </ctx.ui.Button>
              </ctx.ui.Tooltip>
            )}
          </Show>
        );
      },
    });
  },
});

function label(speed: number, ttft: number | null): string {
  const rate = `⚡ ${Math.round(speed)} tok/s`;
  return ttft ? `${(ttft / 1000).toFixed(1)}s ${rate}` : rate;
}
