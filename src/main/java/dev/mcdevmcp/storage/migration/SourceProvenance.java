package dev.mcdevmcp.storage.migration;

import io.modelcontextprotocol.json.McpJsonDefaults;

import java.io.IOException;
import java.nio.channels.FileChannel;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.Optional;

@SuppressWarnings("OptionalUsedAsFieldOrParameterType") // Absence is part of the typed provenance decision.
public final class SourceProvenance {
    private SourceProvenance() {
    }

    public static Optional<SourcePreparationStamp> read(Path stamp) throws IOException {
        if (!Files.exists(stamp, LinkOption.NOFOLLOW_LINKS)) {
            return Optional.empty();
        }
        if (!Files.isRegularFile(stamp, LinkOption.NOFOLLOW_LINKS) || Files.isSymbolicLink(stamp)) {
            throw new IOException("Source preparation stamp must be a regular file: " + stamp);
        }
        byte[] bytes = Files.readAllBytes(stamp);
        try {
            return Optional.of(McpJsonDefaults.getMapper().readValue(bytes, SourcePreparationStamp.class));
        } catch (IOException | IllegalArgumentException | NullPointerException exception) {
            throw new InvalidSourceStampException(stamp, exception);
        }
    }

    public static void write(Path target, SourcePreparationStamp stamp) throws IOException {
        byte[] bytes = McpJsonDefaults.getMapper().writeValueAsBytes(stamp);
        try (var channel = FileChannel.open(target, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE)) {
            var buffer = java.nio.ByteBuffer.wrap(bytes);
            while (buffer.hasRemaining()) {
                //noinspection ResultOfMethodCallIgnored
                channel.write(buffer);
            }
            channel.force(true);
        }
    }

    public static SourceSelection select(SourceTreeInventory inventory, SourceValidation validation, Optional<SourcePreparationStamp> stamp, SourceInputIdentity inputs, boolean explicitRefresh) {
        if (!inventory.present() || explicitRefresh) {
            return SourceSelection.GENERATE;
        }
        if (validation.valid()) {
            return SourceSelection.REUSE;
        }
        return trustedGenerated(stamp, inputs, inventory) ? SourceSelection.GENERATE : SourceSelection.REQUIRE_REFRESH;
    }

    public static SourcePreparationStamp generated(SourceInputIdentity inputs, SourceTreeInventory inventory, SourceValidation validation, SourceProducerIdentity producer) {
        return new SourcePreparationStamp(1, SourceOwnership.GENERATED, producer, inputs, inventory, validation);
    }

    public static SourcePreparationStamp observed(SourceInputIdentity inputs, SourceTreeInventory inventory, SourceValidation validation, Optional<SourcePreparationStamp> prior) {
        if (trustedGenerated(prior, inputs, inventory)) {
            return generated(inputs, inventory, validation, prior.orElseThrow().producer());
        }
        return new SourcePreparationStamp(1, SourceOwnership.VALIDATED_EXTERNAL, null, inputs, inventory, validation);
    }

    private static boolean trustedGenerated(Optional<SourcePreparationStamp> stamp, SourceInputIdentity inputs, SourceTreeInventory inventory) {
        return stamp.filter(value -> value.ownership() == SourceOwnership.GENERATED && value.inputs().equals(inputs) && value.inventory().equals(inventory)).isPresent();
    }
}
