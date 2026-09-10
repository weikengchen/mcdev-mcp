package dev.mcdevmcp.storage.migration;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

public final class DirectoryAliasFixture {
    private DirectoryAliasFixture() {
    }

    @SuppressWarnings("resource") // Explicit finally cleanup verifies subprocess termination.
    public static void create(Path alias, Path target) throws Exception {
        if (System.getProperty("os.name").toLowerCase(Locale.ROOT).contains("win")) {
            String command = "New-Item -ItemType Junction -Path '" + quote(alias) + "' -Target '" + quote(target) + "' -ErrorAction Stop | Out-Null";
            Process process = new ProcessBuilder("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", command).redirectErrorStream(true).start();
            try {
                if (!process.waitFor(10, TimeUnit.SECONDS)) throw new IOException("Junction creation timed out");
                if (process.exitValue() != 0) {
                    throw new IOException("Junction creation failed: " + new String(process.getInputStream().readAllBytes(), java.nio.charset.StandardCharsets.UTF_8));
                }
            } finally {
                if (process.isAlive()) {
                    process.destroyForcibly();
                    process.waitFor(5, TimeUnit.SECONDS);
                }
            }
        }
        else {
            Files.createSymbolicLink(alias, target);
        }
    }

    private static String quote(Path path) {
        return path.toAbsolutePath().normalize().toString().replace("'", "''");
    }

    public static void remove(Path alias) throws IOException {
        BasicFileAttributes attributes = Files.readAttributes(alias, BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
        if (!attributes.isSymbolicLink() && !attributes.isOther()) {
            throw new IOException("Refusing to remove a real directory as an alias: " + alias);
        }
        Files.delete(alias);
    }
}
