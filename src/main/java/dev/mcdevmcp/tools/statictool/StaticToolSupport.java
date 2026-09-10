package dev.mcdevmcp.tools.statictool;

import dev.mcdevmcp.mcp.tool.api.ContentToolResult;
import dev.mcdevmcp.mcp.tool.api.ToolResult;
import dev.mcdevmcp.storage.PlatformPaths;
import dev.mcdevmcp.storage.callgraph.CallgraphRepository;
import dev.mcdevmcp.storage.h2.SymbolRepository;
import dev.mcdevmcp.storage.h2.VersionStateRepository;
import dev.mcdevmcp.storage.migration.VersionOperationLease;
import dev.mcdevmcp.storage.model.VersionState;
import dev.mcdevmcp.storage.model.ClassSymbol;
import dev.mcdevmcp.storage.model.MinecraftVersion;
import dev.mcdevmcp.storage.model.SourceNamespace;
import dev.mcdevmcp.support.AppVersion;

import javax.lang.model.element.Modifier;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.LinkOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.sql.SQLException;
import java.util.Comparator;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

final class StaticToolSupport {
    private final PlatformPaths paths;
    private final VersionStateRepository states;
    private final Runnable beforeSourceRead;
    private volatile MinecraftVersion activeVersion;

    StaticToolSupport(PlatformPaths paths) {
        this(paths, () -> {
        });
    }

    StaticToolSupport(PlatformPaths paths, Runnable beforeSourceRead) {
        this.paths = paths;
        this.beforeSourceRead = java.util.Objects.requireNonNull(beforeSourceRead, "beforeSourceRead");
        states = new VersionStateRepository(paths);
    }

    static String modifiers(Set<Modifier> values) {
        return values.stream().sorted(Comparator.comparing(Enum::ordinal)).map(value -> value.name().toLowerCase(Locale.ROOT)).collect(Collectors.joining(" ", "", values.isEmpty() ? "" : " "));
    }

    static String returnType(String value) {
        return value == null ? "undefined" : value;
    }

    ContentToolResult<Void> execute(String toolName, StaticToolOperation operation) {
        try {
            return operation.run();
        } catch (ExpectedVersionException exception) {
            return ToolResult.text(exception.getMessage());
        } catch (StaticToolException exception) {
            return ToolResult.error("Error executing " + toolName + ": " + exception.getMessage());
        } catch (IOException | SQLException exception) {
            String message = exception.getMessage() == null ? exception.toString() : exception.getMessage();
            return ToolResult.error("Error executing " + toolName + ": " + message);
        }
    }

    VersionOperationLease read(MinecraftVersion explicit) throws IOException {
        MinecraftVersion version = explicit == null ? resolveActive() : explicit;
        VersionOperationLease lease = VersionOperationLease.read(paths, version);
        try {
            validateExplicit(explicit, lease);
            return lease;
        } catch (IOException | RuntimeException exception) {
            try {
                lease.close();
            } catch (IOException failure) {
                exception.addSuppressed(failure);
            }
            throw exception;
        }
    }

    private void validateExplicit(MinecraftVersion explicit, VersionOperationLease lease) throws IOException {
        if (explicit != null) {
            if (!Files.isDirectory(lease.boundary().require(lease.resolvedPaths().sourceRoot(explicit)))) {
                throw new ExpectedVersionException("Version " + explicit.value() + " not initialized. STOP and ask the USER to run this command in their terminal:\n" + "  java --enable-preview -jar " + AppVersion.executableJarName() + " init -v " + explicit.value() + "\n\n" + "This will download, decompile, and index Minecraft " + explicit.value() + " sources (including callgraph).");
            }
            if (!indexed(explicit, lease)) {
                throw new ExpectedVersionException("Version " + explicit.value() + " not indexed. STOP and ask the USER to run this command in their terminal:\n" + "  java --enable-preview -jar " + AppVersion.executableJarName() + " init -v " + explicit.value() + "\n\n" + "This will index Minecraft " + explicit.value() + " sources (including callgraph).");
            }
        }
    }

    private MinecraftVersion resolveActive() {
        if (activeVersion == null) {
            throw new ExpectedVersionException("""
                                               No Minecraft version is currently set.
                                               
                                               STOP and ask the USER which version they want to use, then call mc_version with action="set".
                                               Or, provide a 'version' parameter in your tool call.
                                               
                                               To see available versions, call mc_version with action="list".
                                               """.stripTrailing());
        }
        return activeVersion;
    }

    void activate(MinecraftVersion version) {
        activeVersion = version;
    }

    Optional<MinecraftVersion> active() {
        return Optional.ofNullable(activeVersion);
    }

    SymbolRepository repository(VersionOperationLease lease) throws IOException {
        lease.require(paths, lease.version());
        Path database = lease.boundary().require(lease.resolvedPaths().symbolDatabase(lease.version()));
        lease.boundary().require(database.resolveSibling(database.getFileName() + ".lock"));
        return new SymbolRepository(database);
    }

    CallgraphRepository callgraphRepository(VersionOperationLease lease) throws IOException {
        lease.require(paths, lease.version());
        return new CallgraphRepository(lease.boundary().require(lease.resolvedPaths().callgraphBundle(lease.version())), lease.version());
    }

    boolean indexed(MinecraftVersion version, VersionOperationLease lease) throws IOException {
        return states.state(version, lease) == VersionState.READY;
    }

    PlatformPaths paths() {
        return paths;
    }

    String fullSource(MinecraftVersion version, ClassSymbol symbol) throws IOException {
        try (var lease = VersionOperationLease.read(paths, version)) {
            return fullSource(lease, symbol);
        }
    }

    String fullSource(VersionOperationLease lease, ClassSymbol symbol) throws IOException {
        beforeSourceRead.run();
        lease.require(paths, lease.version());
        PlatformPaths resolvedPaths = lease.resolvedPaths();
        Path root = symbol.namespace() == SourceNamespace.FABRIC ? resolvedPaths.fabricSourceRoot(symbol.fabricApiVersion().orElseThrow()) : resolvedPaths.sourceRoot(lease.version());
        Path relative;
        try {
            relative = symbol.sourcePath().normalize();
        } catch (RuntimeException exception) {
            throw new StaticToolException("Unsafe indexed source path: " + symbol.sourcePath());
        }
        if (relative.isAbsolute() || relative.startsWith("..")) {
            throw new StaticToolException("Unsafe indexed source path: " + symbol.sourcePath());
        }
        Path resolvedRoot = lease.boundary().require(root).toRealPath();
        Path current = resolvedRoot;
        int depth = 0;
        for (Path component : relative) {
            current = current.resolve(component);
            BasicFileAttributes attributes = Files.readAttributes(current, BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
            if (attributes.isSymbolicLink() || attributes.isOther() || ++depth < relative.getNameCount() && !attributes.isDirectory()) {
                throw new StaticToolException("Unsafe indexed source path: " + symbol.sourcePath());
            }
        }
        Path file = lease.boundary().require(root.resolve(relative)).toRealPath();
        if (!file.startsWith(resolvedRoot) || !Files.isRegularFile(file)) {
            throw new StaticToolException("Unsafe indexed source path: " + symbol.sourcePath());
        }
        return Files.readString(file, StandardCharsets.UTF_8);
    }

}
