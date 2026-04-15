export { mcVersionTool } from './version.js';
export { mcSearchTool } from './search-source.js';
export { mcGetClassTool } from './get-class.js';
export { mcGetMethodTool } from './get-method.js';
export { mcListClassesTool } from './list-classes.js';
export { mcListPackagesTool } from './list-packages.js';
export { mcFindHierarchyTool } from './find-hierarchy.js';
export { mcFindRefsTool } from './find-refs.js';

import { mcVersionTool } from './version.js';
import { mcSearchTool } from './search-source.js';
import { mcGetClassTool } from './get-class.js';
import { mcGetMethodTool } from './get-method.js';
import { mcListClassesTool } from './list-classes.js';
import { mcListPackagesTool } from './list-packages.js';
import { mcFindHierarchyTool } from './find-hierarchy.js';
import { mcFindRefsTool } from './find-refs.js';

export const staticTools = [
  mcVersionTool,
  mcSearchTool,
  mcGetClassTool,
  mcGetMethodTool,
  mcFindRefsTool,
  mcListClassesTool,
  mcListPackagesTool,
  mcFindHierarchyTool,
];
