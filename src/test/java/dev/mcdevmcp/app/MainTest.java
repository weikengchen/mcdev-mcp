package dev.mcdevmcp.app;

import org.junit.jupiter.api.Test;

import java.io.PrintWriter;
import java.io.StringWriter;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MainTest {
    @Test
    void versionExitsSuccessfullyAndPrintsTheReleaseVersion() {
        var output = new StringWriter();

        int exitCode = Main.execute(new String[]{"--version"}, 26, new PrintWriter(output), new PrintWriter(new StringWriter()));

        assertEquals(0, exitCode);
        assertEquals(System.getProperty("mcdevMcpVersion") + System.lineSeparator(), output.toString());
    }

    @Test
    void rejectsJavaBelow26BeforeCommandExecution() {
        var error = new StringWriter();

        int exitCode = Main.execute(new String[]{"--version"}, 25, new PrintWriter(new StringWriter()), new PrintWriter(error));

        assertEquals(1, exitCode);
        assertTrue(error.toString().contains("Java 26 with --enable-preview is required"));
    }

    @Test
    void rejectsNewerJavaBeforeCommandExecution() {
        var output = new StringWriter();
        var error = new StringWriter();

        int exitCode = Main.execute(new String[]{"--version"}, 27, new PrintWriter(output), new PrintWriter(error));

        assertEquals(1, exitCode);
        assertEquals("", output.toString());
        assertTrue(error.toString().contains("Java 26 with --enable-preview is required; detected Java 27"));
    }
}
