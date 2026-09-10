package dev.mcdevmcp.storage.migration;

import dev.mcdevmcp.storage.model.MinecraftVersion;

import java.io.IOException;
import java.nio.file.Path;

public final class RecoveryRequiredException extends IOException {
    @java.io.Serial
    private static final long serialVersionUID = 1L;

    public RecoveryRequiredException(MinecraftVersion version, Path pending) {
        super("Source/index recovery required for Minecraft " + version.value() + ": " + pending);
    }
}