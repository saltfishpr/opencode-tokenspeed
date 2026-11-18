import { createKeyed, Plugin, Slot, Style } from "@opencode/plugin/gui";
import { createEffect, mapArray, onCleanup, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { SpeedTracker, type SpeedSnapshot } from "./speed";

// Match the host indicator button styles in OpenCode Desktop; the SDK Button
// has no style prop.
const BUTTON_STYLE = `
  [data-component="button-v2"].tokenspeed-button {
    flex-shrink: 0;
    color: var(--v2-text-text-faint);
    white-space: nowrap;
  }
  .tokenspeed-button:active > span {
    color: var(--v2-text-text-muted);
  }
`;

export default Plugin.define({
  setup(ctx) {
    const [snapshots, setSnapshots] = createStore<Partial<Record<string, Record<string, SpeedSnapshot>>>>({});

    // Keep listening for background tabs without opening another event stream.
    createEffect(
      mapArray(
        () => [...new Set(ctx.sessions.list().map((session) => session.server))],
        (server) => {
          createKeyed(
            () => server.data,
            (data) => {
              const tracker = new SpeedTracker();
              setSnapshots(server.id, {});
              const record = (sessionID: string) => setSnapshots(server.id, sessionID, tracker.snapshot(sessionID));
              const stop = data.listen(({ details }) => {
                const sessionID = tracker.onEvent(details);
                if (sessionID) record(sessionID);
              });
              const timer = setInterval(() => {
                for (const sessionID of tracker.tick(Date.now())) record(sessionID);
              }, 500);
              onCleanup(() => {
                stop();
                clearInterval(timer);
                setSnapshots(server.id, undefined);
              });
            },
          );
        },
      ),
    );

    ctx.add(Style, BUTTON_STYLE);
    ctx.add(Slot, {
      at: "session.header",
      // Host built-ins use 10 for the session-context button and 20 for the details summary.
      order: 11,
      render(input) {
        // Only the routed timeline shows the indicator, and only while the
        // agent works on that session; the slot then renders no DOM at all.
        const shown = () => {
          const value = input.active ? snapshots[input.session.server.id]?.[input.session.id] : undefined;
          return value?.busy ? value : undefined;
        };
        return (
          <Show when={shown()}>
            {(value) => {
              const speed = () => {
                const snap = value();
                const rate = Math.round(snap.speed > 0 ? snap.speed : snap.average);
                return rate > 0 ? rate : "-";
              };
              const ttft = () => {
                const ms = value().ttft;
                return ms ? `${(ms / 1000).toFixed(1)}s` : "-";
              };
              return (
                <ctx.ui.Tooltip
                  placement="bottom"
                  value={
                    <span style={{ display: "flex", "flex-direction": "column" }}>
                      <span>Token Speed</span>
                      <span>TTFT: {ttft()}</span>
                    </span>
                  }
                >
                  <ctx.ui.Button icon="waveform" variant="ghost-muted" class="tokenspeed-button" size="small">
                    <span
                      style={{
                        display: "inline-block",
                        "min-width": "3ch",
                        "text-align": "right",
                        "font-variant-numeric": "tabular-nums",
                      }}
                    >
                      {speed()}
                    </span>
                    <span>tok/s</span>
                  </ctx.ui.Button>
                </ctx.ui.Tooltip>
              );
            }}
          </Show>
        );
      },
    });
  },
});
