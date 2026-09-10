package dev.mcdevmcp.storage.migration;

import java.io.IOException;
import java.nio.file.Path;

public final class InvalidSourceStampException extends IOException {
    @java.io.Serial
    private static final long serialVersionUID = 1L;

    public InvalidSourceStampException(Path stamp, Exception cause) {
        super("Invalid source preparation stamp: " + stamp, cause);
    }
}