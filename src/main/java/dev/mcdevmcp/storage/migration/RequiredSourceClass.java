package dev.mcdevmcp.storage.migration;

record RequiredSourceClass(String binaryName, String packageName, String simpleName, String unit, String owner, boolean topLevel, boolean packageInfo, boolean module) {
}