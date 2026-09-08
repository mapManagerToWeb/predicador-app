package com.predicador.reporting.migration;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertTrue;

class Task3MigrationTest {
    @Test
    void duplicateCleanupRemapsReportReferencesBeforeDeletingAndIndexing() throws Exception {
        String sql = new String(Task3MigrationTest.class.getResourceAsStream(
                "/db/migration/V1_1__deduplicate_encargado_identity.sql").readAllBytes(), StandardCharsets.UTF_8)
                .toLowerCase();

        int update = sql.indexOf("update registro_predicacion");
        int delete = sql.indexOf("delete from encargados");
        int index = sql.indexOf("create unique index");

        assertTrue(update >= 0, "duplicate cleanup must remap historical report references");
        assertTrue(delete > update, "duplicates must be deleted after references are remapped");
        assertTrue(index > delete, "the unique index must be created after cleanup");
    }
}
