package dev.mcdevmcp.storage.h2;

import java.io.IOException;
import java.nio.channels.FileChannel;
import java.util.Objects;

record DatabaseFileHandle(FileChannel channel, boolean reservationCreated) implements AutoCloseable {
    DatabaseFileHandle(FileChannel channel, boolean reservationCreated) {
        this.channel = Objects.requireNonNull(channel, "channel");
        this.reservationCreated = reservationCreated;
    }

    @Override
    public void close() throws IOException {
        channel.close();
    }
}