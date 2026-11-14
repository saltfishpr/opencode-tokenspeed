import { Plugin } from "@opencode/plugin";

// The server part only declares the plugin id. Token speed is measured from
// the server's public event stream directly inside the TUI and GUI parts, so
// no server-side state or RPC is needed.
export default Plugin.define({
  id: "opencode-tokenspeed",
  setup() {},
});
