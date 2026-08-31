-- Script: Insertar municipios faltantes (sin acentos en departamentos)
BEGIN;

WITH nuevos_municipios (departamento, municipio) AS (
  VALUES
    ('Ahuachapan', 'Ahuachapan Norte'),
    ('Ahuachapan', 'Ahuachapan Centro'),
    ('Ahuachapan', 'Ahuachapan Sur'),
    ('Cabanas', 'Cabanas Este'),
    ('Cabanas', 'Cabanas Oeste'),
    ('Cuscatlan', 'Cuscatlan Norte'),
    ('Cuscatlan', 'Cuscatlan Sur'),
    ('La Union', 'La Union Norte'),
    ('La Union', 'La Union Sur'),
    ('Morazan', 'Morazan Norte'),
    ('Morazan', 'Morazan Sur'),
    ('Usulutan', 'Usulutan Norte'),
    ('Usulutan', 'Usulutan Este'),
    ('Usulutan', 'Usulutan Oeste')
)
INSERT INTO municipios (departamento_id, nombre)
SELECT d.id, n.municipio
FROM nuevos_municipios n
JOIN departamentos d ON d.nombre = n.departamento
ON CONFLICT (departamento_id, nombre) DO NOTHING;

-- Re-insertar anfitriones que se borraron
INSERT INTO anfitriones (nombre, email, telefono, verificado, municipio_id)
SELECT 'Carlos Lopez', 'carlos.lopez@iguanasv.com', '+503 7012 3456', true, m.id
FROM municipios m WHERE m.nombre = 'San Salvador Centro' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO anfitriones (nombre, email, telefono, verificado, municipio_id)
SELECT 'Maria Hernandez', 'maria.hernandez@iguanasv.com', '+503 7234 5678', true, m.id
FROM municipios m WHERE m.nombre = 'Ahuachapan Centro' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO anfitriones (nombre, email, telefono, verificado, municipio_id)
SELECT 'Jose Martinez', 'jose.martinez@iguanasv.com', '+503 7345 6789', true, m.id
FROM municipios m WHERE m.nombre = 'Cuscatlan Norte' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO anfitriones (nombre, email, telefono, verificado, municipio_id)
SELECT 'Ana Rivera', 'ana.rivera@iguanasv.com', '+503 7456 7890', false, m.id
FROM municipios m WHERE m.nombre = 'La Libertad Sur' LIMIT 1
ON CONFLICT DO NOTHING;

COMMIT;
