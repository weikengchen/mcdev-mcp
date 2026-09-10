package dev.mcdevmcp.storage.migration;

import java.nio.file.Path;

public record SourcePublicationResult(Path retainedMigration, SourceTreeInventory sourceInventory) {
}
