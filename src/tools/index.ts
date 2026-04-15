// Static tools - work with decompiled Minecraft source code (no game required)
export * from './static/index.js';
export { staticTools } from './static/index.js';

// Runtime tools - interact with a running Minecraft instance via DebugBridge mod
export * from './runtime/index.js';
export { runtimeTools } from './runtime/index.js';

import { staticTools } from './static/index.js';
import { runtimeTools } from './runtime/index.js';

// Combined list of all tools
export const allTools = [
  ...staticTools,
  ...runtimeTools,
];
