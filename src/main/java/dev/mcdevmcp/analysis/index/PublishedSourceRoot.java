package dev.mcdevmcp.analysis.index;

import java.nio.file.Path;
import java.util.Objects;

/**
 * The stable source-root identity stored when an index is built in staging.
 */
public record PublishedSourceRoot(Path path) {
    public PublishedSourceRoot {
        path = Objects.requireNonNull(path, "path").toAbsolutePath().normalize();
    }
}