export { mcConnectTool } from './connect.js';
export { mcExecuteTool } from './execute.js';
export { mcSnapshotTool } from './snapshot.js';
export { mcScreenshotTool } from './screenshot.js';
export { mcRunCommandTool } from './command.js';
export { mcLoggerTool } from './logger.js';
export { mcScriptLogsTool } from './script-logs.js';

import { mcConnectTool } from './connect.js';
import { mcExecuteTool } from './execute.js';
import { mcSnapshotTool } from './snapshot.js';
import { mcScreenshotTool } from './screenshot.js';
import { mcRunCommandTool } from './command.js';
import { mcLoggerTool } from './logger.js';
import { mcScriptLogsTool } from './script-logs.js';

// Dev-only tools (enabled via MCDEV_SCRIPT_LOGS=1 or =true)
const devToolsEnabled = /^(1|true)$/i.test(process.env.MCDEV_SCRIPT_LOGS ?? '');

export const runtimeTools = [
    mcConnectTool,
    mcExecuteTool,
    mcSnapshotTool,
    mcScreenshotTool,
    mcRunCommandTool,
    mcLoggerTool,
    // Dev-only tools
    ...(devToolsEnabled ? [mcScriptLogsTool] : []),
];
