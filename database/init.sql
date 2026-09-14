-- init.sql: Se ejecuta automaticamente al iniciar PostgreSQL por primera vez
-- Orden: schema -> departamentos -> seed municipios 44 -> categorias -> amenidades -> anfitriones -> publicaciones

-- =============================================
-- SCHEMA (tablas, indices, constraints)
-- =============================================
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS departamentos (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS municipios (
  id SERIAL PRIMARY KEY,
  departamento_id INT NOT NULL REFERENCES departamentos(id) ON DELETE CASCADE,
  nombre VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(departamento_id, nombre)
);

CREATE TABLE IF NOT EXISTS categorias (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(50) NOT NULL UNIQUE,
  descripcion TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS amenidades (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(50) NOT NULL UNIQUE,
  icono VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS anfitriones (
  id SERIAL PRIMARY KEY,
  municipio_id INT NOT NULL REFERENCES municipios(id) ON DELETE RESTRICT,
  nombre VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  telefono VARCHAR(20),
  direccion TEXT,
  verificado BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS publicaciones (
  id SERIAL PRIMARY KEY,
  anfitrion_id INT NOT NULL REFERENCES anfitriones(id) ON DELETE CASCADE,
  categoria_id INT NOT NULL REFERENCES categorias(id) ON DELETE RESTRICT,
  titulo VARCHAR(200) NOT NULL,
  descripcion TEXT,
  precio_por_noche NUMERIC(10,2) NOT NULL,
  capacidad_maxima INT NOT NULL,
  habitaciones INT DEFAULT 1,
  camas INT DEFAULT 1,
  banos INT DEFAULT 1,
  direccion_exacta TEXT,
  latitud NUMERIC(10,8),
  longitud NUMERIC(11,8),
  estado VARCHAR(20) DEFAULT 'activo',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS experiencias (
  id SERIAL PRIMARY KEY,
  publicacion_id INT NOT NULL REFERENCES publicaciones(id) ON DELETE CASCADE,
  nombre VARCHAR(200) NOT NULL,
  descripcion TEXT,
  duracion_horas INT,
  precio_adicional NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS horarios (
  id SERIAL PRIMARY KEY,
  publicacion_id INT NOT NULL REFERENCES publicaciones(id) ON DELETE CASCADE,
  dia_semana INT NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fin TIME NOT NULL,
  disponible BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS imagenes_publicacion (
  id SERIAL PRIMARY KEY,
  publicacion_id INT NOT NULL REFERENCES publicaciones(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  es_principal BOOLEAN DEFAULT false,
  orden INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS publicacion_amenidad (
  publicacion_id INT NOT NULL REFERENCES publicaciones(id) ON DELETE CASCADE,
  amenidad_id INT NOT NULL REFERENCES amenidades(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(publicacion_id, amenidad_id)
);

CREATE TABLE IF NOT EXISTS reservas (
  id SERIAL PRIMARY KEY,
  publicacion_id INT NOT NULL REFERENCES publicaciones(id) ON DELETE CASCADE,
  nombre_huesped VARCHAR(100) NOT NULL,
  email_huesped VARCHAR(150) NOT NULL,
  telefono_huesped VARCHAR(20),
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  numero_huespedes INT NOT NULL,
  precio_total NUMERIC(10,2) NOT NULL,
  estado VARCHAR(20) DEFAULT 'pendiente',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notificaciones (
  id SERIAL PRIMARY KEY,
  reserva_id INT NOT NULL REFERENCES reservas(id) ON DELETE CASCADE,
  tipo VARCHAR(30) NOT NULL,
  mensaje TEXT NOT NULL,
  leida BOOLEAN DEFAULT false,
  destinatario_email VARCHAR(150) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reserva_horario (
  reserva_id INT NOT NULL REFERENCES reservas(id) ON DELETE CASCADE,
  horario_id INT NOT NULL REFERENCES horarios(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(reserva_id, horario_id)
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_anfitriones_municipio ON anfitriones(municipio_id);
CREATE INDEX IF NOT EXISTS idx_municipios_departamento ON municipios(departamento_id);
CREATE INDEX IF NOT EXISTS idx_publicaciones_anfitrion ON publicaciones(anfitrion_id);
CREATE INDEX IF NOT EXISTS idx_publicaciones_categoria ON publicaciones(categoria_id);
CREATE INDEX IF NOT EXISTS idx_publicaciones_estado ON publicaciones(estado);
CREATE INDEX IF NOT EXISTS idx_experiencias_publicacion ON experiencias(publicacion_id);
CREATE INDEX IF NOT EXISTS idx_horarios_publicacion ON horarios(publicacion_id);
CREATE INDEX IF NOT EXISTS idx_imagenes_publicacion_publicacion ON imagenes_publicacion(publicacion_id);
CREATE INDEX IF NOT EXISTS idx_reservas_publicacion ON reservas(publicacion_id);
CREATE INDEX IF NOT EXISTS idx_reservas_estado ON reservas(estado);
CREATE INDEX IF NOT EXISTS idx_reservas_fechas ON reservas(fecha_inicio, fecha_fin);
CREATE INDEX IF NOT EXISTS idx_notificaciones_reserva ON notificaciones(reserva_id);
CREATE INDEX IF NOT EXISTS idx_notificaciones_destinatario ON notificaciones(destinatario_email);
CREATE INDEX IF NOT EXISTS idx_reserva_horario_reserva ON reserva_horario(reserva_id);

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
-- SEED: Categorias
-- =============================================
INSERT INTO categorias (nombre)
VALUES ('Aventura'),('Surf'),('Cultura'),('Gastronomía'),('Naturaleza'),('Hospedaje')
ON CONFLICT (nombre) DO NOTHING;

-- =============================================
-- SEED: Amenidades
-- =============================================
INSERT INTO amenidades (nombre)
VALUES ('Wi-Fi'),('Piscina'),('Estacionamiento'),('Aire acondicionado'),('Cocina'),('Lavadora'),('TV'),('Desayuno incluido'),('Pet Friendly'),('Terraza')
ON CONFLICT (nombre) DO NOTHING;

-- =============================================
-- SEED: Anfitriones
-- =============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM anfitriones WHERE email = 'carlos.lopez@iguanasv.com') THEN
    INSERT INTO anfitriones (municipio_id, nombre, email, telefono, verificado)
    SELECT m.id, 'Carlos López', 'carlos.lopez@iguanasv.com', '+503 7012 3456', true
    FROM municipios m WHERE m.nombre = 'San Salvador Centro' LIMIT 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM anfitriones WHERE email = 'maria.hernandez@iguanasv.com') THEN
    INSERT INTO anfitriones (municipio_id, nombre, email, telefono, verificado)
    SELECT m.id, 'María Hernández', 'maria.hernandez@iguanasv.com', '+503 7234 5678', true
    FROM municipios m WHERE m.nombre = 'Ahuachapán Centro' LIMIT 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM anfitriones WHERE email = 'jose.martinez@iguanasv.com') THEN
    INSERT INTO anfitriones (municipio_id, nombre, email, telefono, verificado)
    SELECT m.id, 'José Martínez', 'jose.martinez@iguanasv.com', '+503 7345 6789', true
    FROM municipios m WHERE m.nombre = 'Cuscatlán Norte' LIMIT 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM anfitriones WHERE email = 'ana.rivera@iguanasv.com') THEN
    INSERT INTO anfitriones (municipio_id, nombre, email, telefono, verificado)
    SELECT m.id, 'Ana Rivera', 'ana.rivera@iguanasv.com', '+503 7456 7890', false
    FROM municipios m WHERE m.nombre = 'La Libertad Sur' LIMIT 1;
  END IF;
END $$;

-- =============================================
-- SEED: Publicaciones, experiencias, imagenes, horarios, amenidades, reservas
-- =============================================
DO $$
DECLARE
  v_anf1 INT; v_anf2 INT; v_anf3 INT; v_anf4 INT;
  v_cat_surf INT; v_cat_cultura INT; v_cat_aventura INT; v_cat_hospedaje INT;
  v_pub1 INT; v_pub2 INT; v_pub3 INT; v_pub4 INT; v_pub5 INT;
BEGIN
  SELECT id INTO v_anf1 FROM anfitriones WHERE email = 'carlos.lopez@iguanasv.com';
  SELECT id INTO v_anf2 FROM anfitriones WHERE email = 'maria.hernandez@iguanasv.com';
  SELECT id INTO v_anf3 FROM anfitriones WHERE email = 'jose.martinez@iguanasv.com';
  SELECT id INTO v_anf4 FROM anfitriones WHERE email = 'ana.rivera@iguanasv.com';
  SELECT id INTO v_cat_surf FROM categorias WHERE nombre = 'Surf';
  SELECT id INTO v_cat_cultura FROM categorias WHERE nombre = 'Cultura';
  SELECT id INTO v_cat_aventura FROM categorias WHERE nombre = 'Aventura';
  SELECT id INTO v_cat_hospedaje FROM categorias WHERE nombre = 'Hospedaje';

  -- Publicaciones
  IF NOT EXISTS (SELECT 1 FROM publicaciones WHERE titulo = 'Clases de Surf en El Tunco') THEN
    INSERT INTO publicaciones (anfitrion_id, categoria_id, titulo, descripcion, precio_por_noche, capacidad_maxima, direccion_exacta, estado)
    VALUES (v_anf4, v_cat_surf, 'Clases de Surf en El Tunco', 'Aprende a surfear en las mejores olas de El Salvador con instructores certificados.', 35.00, 8, 'Playa El Tunco, La Libertad', 'activo')
    RETURNING id INTO v_pub1;
  ELSE SELECT id INTO v_pub1 FROM publicaciones WHERE titulo = 'Clases de Surf en El Tunco'; END IF;

  IF NOT EXISTS (SELECT 1 FROM publicaciones WHERE titulo = 'Tour del Café en Apaneca') THEN
    INSERT INTO publicaciones (anfitrion_id, categoria_id, titulo, descripcion, precio_por_noche, capacidad_maxima, direccion_exacta, estado)
    VALUES (v_anf2, v_cat_cultura, 'Tour del Café en Apaneca', 'Recorrido por fincas de café en la Ruta de las Flores, con degustación incluida.', 25.00, 12, 'Apaneca, Ahuachapán', 'activo')
    RETURNING id INTO v_pub2;
  ELSE SELECT id INTO v_pub2 FROM publicaciones WHERE titulo = 'Tour del Café en Apaneca'; END IF;

  IF NOT EXISTS (SELECT 1 FROM publicaciones WHERE titulo = 'Ascenso al Volcán Santa Ana') THEN
    INSERT INTO publicaciones (anfitrion_id, categoria_id, titulo, descripcion, precio_por_noche, capacidad_maxima, direccion_exacta, estado)
    VALUES (v_anf1, v_cat_aventura, 'Ascenso al Volcán Santa Ana', 'Excursión guiada al cráter del volcán Ilamatepec con vistas espectaculares.', 45.00, 10, 'Parque Nacional Cerro Verde, Santa Ana', 'activo')
    RETURNING id INTO v_pub3;
  ELSE SELECT id INTO v_pub3 FROM publicaciones WHERE titulo = 'Ascenso al Volcán Santa Ana'; END IF;

  IF NOT EXISTS (SELECT 1 FROM publicaciones WHERE titulo = 'Hostal Casa de Suchitoto') THEN
    INSERT INTO publicaciones (anfitrion_id, categoria_id, titulo, descripcion, precio_por_noche, capacidad_maxima, direccion_exacta, habitaciones, camas, banos, estado)
    VALUES (v_anf3, v_cat_hospedaje, 'Hostal Casa de Suchitoto', 'Alojamiento colonial frente al lago de Suchitoto con desayuno incluido.', 55.00, 6, 'Calle Los Heroes #5, Suchitoto', 3, 4, 2, 'activo')
    RETURNING id INTO v_pub4;
  ELSE SELECT id INTO v_pub4 FROM publicaciones WHERE titulo = 'Hostal Casa de Suchitoto'; END IF;

  IF NOT EXISTS (SELECT 1 FROM publicaciones WHERE titulo = 'Cabaña en la Ruta de las Flores') THEN
    INSERT INTO publicaciones (anfitrion_id, categoria_id, titulo, descripcion, precio_por_noche, capacidad_maxima, direccion_exacta, habitaciones, camas, banos, estado)
    VALUES (v_anf2, v_cat_hospedaje, 'Cabaña en la Ruta de las Flores', 'Cabaña rústica con vista al valle, ideal para parejas y familias.', 75.00, 4, 'Ruta de las Flores, Sonsonate', 2, 2, 1, 'activo')
    RETURNING id INTO v_pub5;
  ELSE SELECT id INTO v_pub5 FROM publicaciones WHERE titulo = 'Cabaña en la Ruta de las Flores'; END IF;

  -- Experiencias
  IF NOT EXISTS (SELECT 1 FROM experiencias WHERE publicacion_id = v_pub1) THEN
    INSERT INTO experiencias (publicacion_id, nombre, descripcion, duracion_horas, precio_adicional)
    VALUES (v_pub1, 'Clase de surf principiantes', 'Clase de 2 horas para principiantes con equipo incluido.', 2, 10.00);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM experiencias WHERE publicacion_id = v_pub2) THEN
    INSERT INTO experiencias (publicacion_id, nombre, descripcion, duracion_horas, precio_adicional)
    VALUES (v_pub2, 'Tour de café y degustación', 'Recorrido de 3 horas por finca cafetalera con cata.', 3, 5.00);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM experiencias WHERE publicacion_id = v_pub3) THEN
    INSERT INTO experiencias (publicacion_id, nombre, descripcion, duracion_horas, precio_adicional)
    VALUES (v_pub3, 'Ascenso guiado al volcán', 'Excursión de 4 horas con guía certificado.', 4, 0.00);
  END IF;

  -- Imágenes
  IF NOT EXISTS (SELECT 1 FROM imagenes_publicacion WHERE publicacion_id = v_pub1) THEN
    INSERT INTO imagenes_publicacion (publicacion_id, url, es_principal)
    VALUES
      (v_pub1, '/api/imagenes/rutasv/surf-1.jpg', true),
      (v_pub1, '/api/imagenes/rutasv/surf-2.jpg', false),
      (v_pub2, '/api/imagenes/rutasv/cafe-1.jpg', true),
      (v_pub2, '/api/imagenes/rutasv/cafe-2.jpg', false),
      (v_pub3, '/api/imagenes/rutasv/volcan-1.jpg', true),
      (v_pub4, '/api/imagenes/rutasv/hostal-1.jpg', true);
  END IF;

  -- Horarios
  IF NOT EXISTS (SELECT 1 FROM horarios WHERE publicacion_id = v_pub1) THEN
    INSERT INTO horarios (publicacion_id, dia_semana, hora_inicio, hora_fin) VALUES
      (v_pub1,1,'06:00','10:00'),(v_pub1,2,'06:00','10:00'),(v_pub1,3,'06:00','10:00'),
      (v_pub1,4,'06:00','10:00'),(v_pub1,5,'06:00','10:00'),(v_pub1,6,'06:00','12:00'),
      (v_pub2,1,'08:00','12:00'),(v_pub2,3,'08:00','12:00'),(v_pub2,5,'08:00','12:00'),(v_pub2,6,'08:00','14:00'),
      (v_pub3,2,'05:00','10:00'),(v_pub3,4,'05:00','10:00'),(v_pub3,6,'05:00','10:00'),
      (v_pub4,1,'14:00','22:00'),(v_pub4,2,'14:00','22:00'),(v_pub4,3,'14:00','22:00'),
      (v_pub4,4,'14:00','22:00'),(v_pub4,5,'14:00','22:00'),(v_pub4,6,'14:00','22:00'),(v_pub4,0,'14:00','22:00');
  END IF;

  -- Publicacion-Amenidades
  IF NOT EXISTS (SELECT 1 FROM publicacion_amenidad WHERE publicacion_id = v_pub1) THEN
    INSERT INTO publicacion_amenidad (publicacion_id, amenidad_id)
    SELECT v_pub1, id FROM amenidades WHERE nombre IN ('Wi-Fi','Terraza')
    UNION ALL SELECT v_pub2, id FROM amenidades WHERE nombre IN ('Wi-Fi','Desayuno incluido','Terraza')
    UNION ALL SELECT v_pub3, id FROM amenidades WHERE nombre IN ('Wi-Fi','Estacionamiento')
    UNION ALL SELECT v_pub4, id FROM amenidades WHERE nombre IN ('Wi-Fi','Desayuno incluido','Aire acondicionado','TV','Lavadora')
    UNION ALL SELECT v_pub5, id FROM amenidades WHERE nombre IN ('Wi-Fi','Cocina','Piscina','Estacionamiento','Pet Friendly');
  END IF;

  -- Reservas de ejemplo
  IF NOT EXISTS (SELECT 1 FROM reservas WHERE publicacion_id = v_pub4) THEN
    INSERT INTO reservas (publicacion_id, nombre_huesped, email_huesped, telefono_huesped, fecha_inicio, fecha_fin, numero_huespedes, precio_total, estado) VALUES
      (v_pub4, 'Ana García', 'ana.garcia@email.com', '+503 7111 2222', CURRENT_DATE - 10, CURRENT_DATE - 7, 2, 165.00, 'completada'),
      (v_pub4, 'Carlos Ruiz', 'carlos.ruiz@email.com', '+503 7333 4444', CURRENT_DATE + 5, CURRENT_DATE + 8, 2, 165.00, 'confirmada'),
      (v_pub5, 'María López', 'maria.lopez@email.com', '+503 7555 6666', CURRENT_DATE + 10, CURRENT_DATE + 14, 3, 300.00, 'pendiente');
  END IF;
END $$;
