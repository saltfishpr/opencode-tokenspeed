/* @jsxImportSource @opentui/solid */
import { Plugin } from "@opencode/plugin/tui";
import { Show } from "solid-js";
import { createStore } from "solid-js/store";
import { SpeedTracker, type SpeedSnapshot } from "./speed";

// Feeds every server event through one tracker and publishes per-session
// snapshots into a Solid store; slot renders read the store reactively.
export default Plugin.define({
  id: "opencode-tokenspeed.tui",
  setup(context) {
    const tracker = new SpeedTracker();
    const [snapshots, setSnapshots] = createStore<Record<string, SpeedSnapshot>>({});
    const record = (sessionID: string) => setSnapshots(sessionID, tracker.snapshot(sessionID));

    const stop = context.data.listen(({ details }) => {
      const sessionID = tracker.onEvent(details);
      if (sessionID) record(sessionID);
    });
    const timer = setInterval(() => {
      for (const sessionID of tracker.tick(Date.now())) record(sessionID);
    }, 500);
    // The footer shows the indicator for the whole turn, including steps that
    // stream nothing yet, and hides it once the session goes idle.
    const visible = (sessionID: string | undefined): SpeedSnapshot | undefined => {
      const snap = sessionID ? snapshots[sessionID] : undefined;
      return snap?.busy ? snap : undefined;
    };

    const unregister = context.ui.slot({
      append: "prompt.footer.status",
      render: (input) => (
        <Show when={visible(input.sessionID)}>{(snap) => <text>{label(snap())}</text>}</Show>
      ),
    });

    return () => {
      stop();
      clearInterval(timer);
      unregister();
    };
  },
});

function label(snap: SpeedSnapshot): string {
  // A quiet stream keeps the last completed turn's average on screen until
  // new deltas replace it with the live estimate.
  const value = Math.round(snap.speed > 0 ? snap.speed : snap.average);
  const rate = `↯ ${value > 0 ? value : "-"} tok/s`;
  return snap.ttft ? `TTFT ${(snap.ttft / 1000).toFixed(1)}s ${rate}` : rate;
}
