-- Script: Reemplazar 262+ municipios viejos por los 44 nuevos (Ley de Reestructuración 2023)
-- Advertencia: Elimina todos los anfitriones existentes primero (por dependencia FK)

BEGIN;

-- 1. Eliminar anfitriones (dependen de municipios)
DELETE FROM anfitriones;

-- 2. Eliminar todos los municipios viejos
DELETE FROM municipios;

-- 3. Insertar los 44 municipios nuevos
WITH nuevos_municipios (departamento, municipio) AS (
  VALUES
    -- Ahuachapán (3)
    ('Ahuachapán', 'Ahuachapán Norte'),
    ('Ahuachapán', 'Ahuachapán Centro'),
    ('Ahuachapán', 'Ahuachapán Sur'),

    -- Cabañas (2)
    ('Cabañas', 'Cabañas Este'),
    ('Cabañas', 'Cabañas Oeste'),

    -- Chalatenango (3)
    ('Chalatenango', 'Chalatenango Norte'),
    ('Chalatenango', 'Chalatenango Centro'),
    ('Chalatenango', 'Chalatenango Sur'),

    -- Cuscatlán (2)
    ('Cuscatlán', 'Cuscatlán Norte'),
    ('Cuscatlán', 'Cuscatlán Sur'),

    -- La Libertad (6)
    ('La Libertad', 'La Libertad Norte'),
    ('La Libertad', 'La Libertad Centro'),
    ('La Libertad', 'La Libertad Oeste'),
    ('La Libertad', 'La Libertad Este'),
    ('La Libertad', 'La Libertad Costa'),
    ('La Libertad', 'La Libertad Sur'),

    -- La Paz (3)
    ('La Paz', 'La Paz Oeste'),
    ('La Paz', 'La Paz Centro'),
    ('La Paz', 'La Paz Este'),

    -- La Unión (2)
    ('La Unión', 'La Unión Norte'),
    ('La Unión', 'La Unión Sur'),

    -- Morazán (2)
    ('Morazán', 'Morazán Norte'),
    ('Morazán', 'Morazán Sur'),

    -- San Miguel (3)
    ('San Miguel', 'San Miguel Norte'),
    ('San Miguel', 'San Miguel Centro'),
    ('San Miguel', 'San Miguel Oeste'),

    -- San Salvador (5)
    ('San Salvador', 'San Salvador Norte'),
    ('San Salvador', 'San Salvador Oeste'),
    ('San Salvador', 'San Salvador Este'),
    ('San Salvador', 'San Salvador Centro'),
    ('San Salvador', 'San Salvador Sur'),

    -- San Vicente (2)
    ('San Vicente', 'San Vicente Norte'),
    ('San Vicente', 'San Vicente Sur'),

    -- Santa Ana (4)
    ('Santa Ana', 'Santa Ana Norte'),
    ('Santa Ana', 'Santa Ana Centro'),
    ('Santa Ana', 'Santa Ana Este'),
    ('Santa Ana', 'Santa Ana Oeste'),

    -- Sonsonate (4)
    ('Sonsonate', 'Sonsonate Norte'),
    ('Sonsonate', 'Sonsonate Centro'),
    ('Sonsonate', 'Sonsonate Este'),
    ('Sonsonate', 'Sonsonate Oeste'),

    -- Usulután (3)
    ('Usulután', 'Usulután Norte'),
    ('Usulután', 'Usulután Este'),
    ('Usulután', 'Usulután Oeste')
)
INSERT INTO municipios (departamento_id, nombre)
SELECT d.id, n.municipio
FROM nuevos_municipios n
JOIN departamentos d ON d.nombre = n.departamento
ON CONFLICT (departamento_id, nombre) DO NOTHING;

-- 4. Re-insertar anfitriones de ejemplo con nuevos municipios
INSERT INTO anfitriones (nombre, email, telefono, verificado, municipio_id)
SELECT 'Carlos Lopez', 'carlos.lopez@iguanasv.com', '+503 7012 3456', true, m.id
FROM municipios m WHERE m.nombre = 'San Salvador Centro' LIMIT 1;

INSERT INTO anfitriones (nombre, email, telefono, verificado, municipio_id)
SELECT 'Maria Hernandez', 'maria.hernandez@iguanasv.com', '+503 7234 5678', true, m.id
FROM municipios m WHERE m.nombre = 'Ahuachapán Centro' LIMIT 1;

INSERT INTO anfitriones (nombre, email, telefono, verificado, municipio_id)
SELECT 'Jose Martinez', 'jose.martinez@iguanasv.com', '+503 7345 6789', true, m.id
FROM municipios m WHERE m.nombre = 'Cuscatlán Norte' LIMIT 1;

INSERT INTO anfitriones (nombre, email, telefono, verificado, municipio_id)
SELECT 'Ana Rivera', 'ana.rivera@iguanasv.com', '+503 7456 7890', false, m.id
FROM municipios m WHERE m.nombre = 'La Libertad Sur' LIMIT 1;

COMMIT;
