package dev.mcdevmcp.storage.migration;

import java.util.Set;

record ParsedSourceUnit(String packageName, Set<String> declarations, boolean module) {
}
