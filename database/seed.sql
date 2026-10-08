-- seed.sql: reference data only.
-- EF migrations (Backend/IguanaSV.Api/Migrations) are the SINGLE SOURCE OF TRUTH for the
-- schema: this file MUST NOT contain any table/index/constraint DDL and MUST run only
-- AFTER `dotnet ef database update` (the compose `migrator` service guarantees the order).
-- Every statement is existence-guarded so re-running the seed is idempotent.
-- Scope: reference data ONLY (departamentos, municipios, categorias, amenidades).
-- Demo content (anfitriones, publicaciones, reservas de ejemplo) is intentionally
-- NOT seeded: those rows are created by real users through the app.

-- =============================================
-- SEED: 14 departamentos
-- =============================================
INSERT INTO departamentos (nombre)
VALUES
  ('Ahuachapán'),('Cabañas'),('Chalatenango'),('Cuscatlán'),
  ('La Libertad'),('La Paz'),('La Unión'),('Morazán'),
  ('San Miguel'),('San Salvador'),('San Vicente'),('Santa Ana'),
  ('Sonsonate'),('Usulután')
ON CONFLICT (nombre) DO NOTHING;

-- =============================================
-- SEED: 44 municipios (Ley de Reestructuracion 2023)
-- =============================================
WITH nuevos_municipios (departamento, municipio) AS (
  VALUES
    ('Ahuachapán','Ahuachapán Norte'),('Ahuachapán','Ahuachapán Centro'),('Ahuachapán','Ahuachapán Sur'),
    ('Cabañas','Cabañas Este'),('Cabañas','Cabañas Oeste'),
    ('Chalatenango','Chalatenango Norte'),('Chalatenango','Chalatenango Centro'),('Chalatenango','Chalatenango Sur'),
    ('Cuscatlán','Cuscatlán Norte'),('Cuscatlán','Cuscatlán Sur'),
    ('La Libertad','La Libertad Norte'),('La Libertad','La Libertad Centro'),('La Libertad','La Libertad Oeste'),
    ('La Libertad','La Libertad Este'),('La Libertad','La Libertad Costa'),('La Libertad','La Libertad Sur'),
    ('La Paz','La Paz Oeste'),('La Paz','La Paz Centro'),('La Paz','La Paz Este'),
    ('La Unión','La Unión Norte'),('La Unión','La Unión Sur'),
    ('Morazán','Morazán Norte'),('Morazán','Morazán Sur'),
    ('San Miguel','San Miguel Norte'),('San Miguel','San Miguel Centro'),('San Miguel','San Miguel Oeste'),
    ('San Salvador','San Salvador Norte'),('San Salvador','San Salvador Oeste'),('San Salvador','San Salvador Este'),
    ('San Salvador','San Salvador Centro'),('San Salvador','San Salvador Sur'),
    ('San Vicente','San Vicente Norte'),('San Vicente','San Vicente Sur'),
    ('Santa Ana','Santa Ana Norte'),('Santa Ana','Santa Ana Centro'),('Santa Ana','Santa Ana Este'),('Santa Ana','Santa Ana Oeste'),
    ('Sonsonate','Sonsonate Norte'),('Sonsonate','Sonsonate Centro'),('Sonsonate','Sonsonate Este'),('Sonsonate','Sonsonate Oeste'),
    ('Usulután','Usulután Norte'),('Usulután','Usulután Este'),('Usulután','Usulután Oeste')
)
INSERT INTO municipios (departamento_id, nombre)
SELECT d.id, n.municipio
FROM nuevos_municipios n
JOIN departamentos d ON d.nombre = n.departamento
ON CONFLICT (departamento_id, nombre) DO NOTHING;

-- =============================================
-- SEED: Categorias (base set)
-- =============================================
INSERT INTO categorias (nombre)
VALUES ('Aventura'),('Surf'),('Cultura'),('Gastronomía'),('Naturaleza'),('Hospedaje')
ON CONFLICT (nombre) DO NOTHING;

-- Reference-data fix: the AddTipoPublicacionCategoria migration renamed a
-- legacy 'Cabaña' category that the current seed never creates, so 'Hospedaje'
-- fell back to the column default ('experiencia') and the publish form had no
-- lodging categories. Re-normalized on every migrator run; idempotent.
UPDATE categorias SET tipo = 'hospedaje' WHERE nombre = 'Hospedaje';

-- =============================================
-- SEED: Categorias de experiencia
-- (absorbed from the retired add_categorias_experiencias.sql; reference data only)
-- =============================================
INSERT INTO categorias (nombre, descripcion, tipo) VALUES
  ('Música', 'Conciertos, festivales musicales y experiencias relacionadas con la música.', 'experiencia'),
  ('Baile', 'Clases, talleres y presentaciones de baile y danza.', 'experiencia'),
  ('Fiestas', 'Fiestas, celebraciones y eventos sociales.', 'experiencia'),
  ('Eventos deportivos', 'Partidos, torneos y experiencias de deportes como espectador o participante.', 'experiencia'),
  ('Festivales', 'Ferias y festivales culturales y tradicionales.', 'experiencia'),
  ('Arte', 'Talleres, exposiciones y experiencias artísticas.', 'experiencia'),
  ('Teatro', 'Obras de teatro y presentaciones escénicas.', 'experiencia')
ON CONFLICT (nombre) DO NOTHING;

-- =============================================
-- SEED: Amenidades
-- =============================================
INSERT INTO amenidades (nombre)
VALUES ('Wi-Fi'),('Piscina'),('Estacionamiento'),('Aire acondicionado'),('Cocina'),('Lavadora'),('TV'),('Desayuno incluido'),('Pet Friendly'),('Terraza')
ON CONFLICT (nombre) DO NOTHING;

[Fact]
[Trait("Category", "Schema")]
public void SeedSql_ContainsNoSchemaDdl_AndEveryInsertIsExistenceGuarded()
{
    var seedPath = Path.Combine(Guard.GuardScan.RepoRoot, "database", "seed.sql");
    Assert.True(File.Exists(seedPath), "database/seed.sql must exist and carry the reference data.");

    var text = File.ReadAllText(seedPath);

    string[] forbidden =
    [
        "CREATE TABLE", "ALTER TABLE", "DROP TABLE",
        "CREATE INDEX", "CREATE UNIQUE INDEX", "DROP INDEX",
        "CREATE EXTENSION",
    ];

    foreach (var token in forbidden)
    {
        Assert.False(
            text.Contains(token, StringComparison.OrdinalIgnoreCase),
            $"database/seed.sql must not contain schema DDL (found \"{token}\"): " +
            "EF migrations are the single source of truth for the schema.");
    }

    // Reference data must still be present and idempotent.
    Assert.Contains("INSERT INTO departamentos", text, StringComparison.OrdinalIgnoreCase);
    Assert.Contains("INSERT INTO municipios", text, StringComparison.OrdinalIgnoreCase);
    Assert.Contains("INSERT INTO categorias", text, StringComparison.OrdinalIgnoreCase);
    Assert.Contains("INSERT INTO amenidades", text, StringComparison.OrdinalIgnoreCase);
    Assert.Contains("ON CONFLICT", text, StringComparison.OrdinalIgnoreCase);
    Assert.DoesNotContain("IF NOT EXISTS (SELECT 1 FROM publicaciones", text, StringComparison.OrdinalIgnoreCase);
}