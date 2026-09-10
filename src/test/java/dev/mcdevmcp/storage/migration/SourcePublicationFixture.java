package dev.mcdevmcp.storage.migration;

import dev.mcdevmcp.storage.PlatformPaths;
import dev.mcdevmcp.storage.h2.AtomicH2Database;
import dev.mcdevmcp.storage.h2.SymbolSchema;
import dev.mcdevmcp.storage.model.MinecraftVersion;
import dev.mcdevmcp.support.Cancellation;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

record SourcePublicationFixture(PlatformPaths paths, MinecraftVersion version, Path transaction, Path source, Path database, Path stamp) {
    static SourcePublicationFixture create(Path root, boolean invalidOldDatabase) throws Exception {
        var paths = new PlatformPaths(root.resolve("cache"));
        var version = new MinecraftVersion("1.21.11");
        Files.createDirectories(paths.sourceRoot(version).resolve("empty"));
        Files.writeString(paths.sourceRoot(version).resolve("Old.java"), "class Old {}\n");
        Files.writeString(paths.sourceRoot(version).resolve("marker"), "user marker\n");
        Files.createDirectories(paths.indexRoot(version).resolve("minecraft"));
        Files.writeString(paths.indexRoot(version).resolve("minecraft/legacy.json"), "legacy index bytes");
        Files.writeString(paths.indexRoot(version).resolve("manifest.json"), "legacy manifest");
        Files.createDirectories(paths.remappedJar(version).getParent());
        Files.writeString(paths.remappedJar(version), "pinned input witness");
        SourceInputIdentity inputs = SourceInputIdentity.capture(paths.remappedJar(version), List.of(), Cancellation.none());
        if (invalidOldDatabase) {
            Files.writeString(paths.symbolDatabase(version), "invalid old database preserved exactly");
        }
        else {
            createDatabase(paths.symbolDatabase(version), paths.sourceRoot(version), version, inputs);
        }
        Files.writeString(paths.indexRoot(version).resolve("symbols.trace.db"), "closed trace");
        Files.writeString(paths.indexRoot(version).resolve("symbols.mv.db.bak"), "old backup bytes");
        Files.writeString(paths.versionCache(version).resolve("source-preparation.json"), "old unknown stamp");
        Path transaction = paths.cacheRoot().resolve("migrations").resolve(version.value()).resolve(UUID.randomUUID().toString());
        Path source = transaction.resolve("candidate/client");
        Files.createDirectories(source);
        Files.writeString(source.resolve("New.java"), "class New {}\n");
        Path database = transaction.resolve("candidate/symbols.mv.db");
        createDatabase(database, paths.sourceRoot(version), version, inputs);
        Path stamp = transaction.resolve("candidate/source-preparation.json");
        SourceProvenance.write(stamp, new SourcePreparationStamp(1, SourceOwnership.VALIDATED_EXTERNAL, null, inputs, SourceTreeInventory.capture(source, Cancellation.none()), new SourceValidation(SourceValidationStatus.VALID, List.of(), List.of("New.java"), List.of("New.java"))));
        return new SourcePublicationFixture(paths, version, transaction, source, database, stamp);
    }

    private static void createDatabase(Path target, Path finalSource, MinecraftVersion version, SourceInputIdentity inputs) throws Exception {
        new AtomicH2Database().rebuild(target, AtomicH2Database.WRITE_LOCK_TIMEOUT, connection -> {
            SymbolSchema.create(connection, version, finalSource.toAbsolutePath().normalize(), inputs.remappedJar().sha256(), Instant.EPOCH);
            SymbolSchema.createIndexes(connection);
            return null;
        }, SymbolSchema::validate);
    }
}