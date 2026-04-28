export { mcConnectTool } from './connect.js';
export { mcExecuteTool } from './execute.js';
export { mcSnapshotTool } from './snapshot.js';
export { mcScreenshotTool } from './screenshot.js';
export { mcRunCommandTool } from './command.js';
export { mcLoggerTool } from './logger.js';
export { mcScriptLogsTool } from './script-logs.js';
export { mcNearbyEntitiesTool } from './nearby-entities.js';
export { mcEntityDetailsTool } from './entity-details.js';
export { mcNearbyBlocksTool } from './nearby-blocks.js';
export { mcBlockDetailsTool } from './block-details.js';
export { mcLookedAtEntityTool } from './looked-at-entity.js';
export { mcSetEntityGlowTool } from './set-entity-glow.js';
export { mcSetBlockGlowTool } from './set-block-glow.js';
export { mcClearBlockGlowTool } from './clear-block-glow.js';
export { mcGetItemTextureTool } from './get-item-texture.js';
export { mcGetEntityItemTextureTool } from './get-entity-item-texture.js';
export { mcGetItemTextureByIdTool } from './get-item-texture-by-id.js';

import { mcConnectTool } from './connect.js';
import { mcExecuteTool } from './execute.js';
import { mcSnapshotTool } from './snapshot.js';
import { mcScreenshotTool } from './screenshot.js';
import { mcRunCommandTool } from './command.js';
import { mcLoggerTool } from './logger.js';
import { mcScriptLogsTool } from './script-logs.js';
import { mcNearbyEntitiesTool } from './nearby-entities.js';
import { mcEntityDetailsTool } from './entity-details.js';
import { mcNearbyBlocksTool } from './nearby-blocks.js';
import { mcBlockDetailsTool } from './block-details.js';
import { mcLookedAtEntityTool } from './looked-at-entity.js';
import { mcSetEntityGlowTool } from './set-entity-glow.js';
import { mcSetBlockGlowTool } from './set-block-glow.js';
import { mcClearBlockGlowTool } from './clear-block-glow.js';
import { mcGetItemTextureTool } from './get-item-texture.js';
import { mcGetEntityItemTextureTool } from './get-entity-item-texture.js';
import { mcGetItemTextureByIdTool } from './get-item-texture-by-id.js';

const isOn = (v: string | undefined) => /^(1|true)$/i.test(v ?? '');

// Dev-only tools (default off). The bridge mirrors these gates with its own
// BridgeConfig flags (loggerInjectionEnabled / runCommandEnabled), so even if
// these envs are flipped on, calls only succeed when both sides agree.
const scriptLogsEnabled = isOn(process.env.MCDEV_SCRIPT_LOGS);
const loggerInjectionEnabled = isOn(process.env.MCDEV_LOGGER_INJECTION);
const runCommandEnabled = isOn(process.env.MCDEV_RUN_COMMAND);

export const runtimeTools = [
    mcConnectTool,
    mcExecuteTool,
    mcSnapshotTool,
    mcScreenshotTool,
    mcNearbyEntitiesTool,
    mcEntityDetailsTool,
    mcNearbyBlocksTool,
    mcBlockDetailsTool,
    mcLookedAtEntityTool,
    mcSetEntityGlowTool,
    mcSetBlockGlowTool,
    mcClearBlockGlowTool,
    mcGetItemTextureTool,
    mcGetEntityItemTextureTool,
    mcGetItemTextureByIdTool,
    // Dev-only tools — default off; flip env on both sides to enable.
    ...(scriptLogsEnabled ? [mcScriptLogsTool] : []),
    ...(loggerInjectionEnabled ? [mcLoggerTool] : []),
    ...(runCommandEnabled ? [mcRunCommandTool] : []),
];
