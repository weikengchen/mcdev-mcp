export { mcConnectTool } from './connect.js';
export { mcExecuteTool } from './execute.js';
export { mcSnapshotTool } from './snapshot.js';
export { mcScreenshotTool } from './screenshot.js';
export { mcRunCommandTool } from './command.js';
export { mcLoggerTool } from './logger.js';
export { mcScriptLogsTool } from './script-logs.js';
export { mcSearchRuntimeTool } from './search.js';
export {
    mcGetItemTextureTool,
    mcGetItemTextureByIdTool,
    mcGetEntityItemTextureTool,
} from './items.js';
export {
    mcNearbyEntitiesTool,
    mcEntityDetailsTool,
    mcLookedAtEntityTool,
    mcSetEntityGlowTool,
} from './entities.js';

import { mcConnectTool } from './connect.js';
import { mcExecuteTool } from './execute.js';
import { mcSnapshotTool } from './snapshot.js';
import { mcScreenshotTool } from './screenshot.js';
import { mcRunCommandTool } from './command.js';
import { mcLoggerTool } from './logger.js';
import { mcScriptLogsTool } from './script-logs.js';
import { mcSearchRuntimeTool } from './search.js';
import {
    mcGetItemTextureTool,
    mcGetItemTextureByIdTool,
    mcGetEntityItemTextureTool,
} from './items.js';
import {
    mcNearbyEntitiesTool,
    mcEntityDetailsTool,
    mcLookedAtEntityTool,
    mcSetEntityGlowTool,
} from './entities.js';

// Dev-only tools (enabled via MCDEV_SCRIPT_LOGS=1)
const devToolsEnabled = process.env.MCDEV_SCRIPT_LOGS === '1';

export const runtimeTools = [
    mcConnectTool,
    mcExecuteTool,
    mcSnapshotTool,
    mcScreenshotTool,
    mcRunCommandTool,
    mcLoggerTool,
    mcSearchRuntimeTool,
    mcGetItemTextureTool,
    mcGetItemTextureByIdTool,
    mcGetEntityItemTextureTool,
    mcNearbyEntitiesTool,
    mcEntityDetailsTool,
    mcLookedAtEntityTool,
    mcSetEntityGlowTool,
    // Dev-only tools
    ...(devToolsEnabled ? [mcScriptLogsTool] : []),
];
