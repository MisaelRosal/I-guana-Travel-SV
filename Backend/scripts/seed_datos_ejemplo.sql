-- Seed: datos de ejemplo para IguanaSV
-- Idempotente: usa ON CONFLICT DO NOTHING / WHERE NOT EXISTS

-- ============================================================
-- 1. Categorías
-- ============================================================
INSERT INTO categorias (nombre)
VALUES
  ('Aventura'),
  ('Surf'),
  ('Cultura'),
  ('Gastronomía'),
  ('Naturaleza'),
  ('Hospedaje')
ON CONFLICT (nombre) DO NOTHING;

-- ============================================================
-- 2. Amenidades
-- ============================================================
INSERT INTO amenidades (nombre)
VALUES
  ('Wi-Fi'),
  ('Piscina'),
  ('Estacionamiento'),
  ('Aire acondicionado'),
  ('Cocina'),
  ('Lavadora'),
  ('TV'),
  ('Desayuno incluido'),
  ('Pet Friendly'),
  ('Terraza')
ON CONFLICT (nombre) DO NOTHING;

-- ============================================================
-- 3. Anfitriones
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM anfitriones WHERE email = 'carlos.lopez@iguanasv.com') THEN
    INSERT INTO anfitriones (municipio_id, nombre, email, telefono, verificado)
    SELECT m.id, 'Carlos López', 'carlos.lopez@iguanasv.com', '+503 7012 3456', true
    FROM municipios m WHERE m.nombre = 'San Salvador' LIMIT 1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM anfitriones WHERE email = 'maria.hernandez@iguanasv.com') THEN
    INSERT INTO anfitriones (municipio_id, nombre, email, telefono, verificado)
    SELECT m.id, 'María Hernández', 'maria.hernandez@iguanasv.com', '+503 7234 5678', true
    FROM municipios m WHERE m.nombre = 'Apaneca' LIMIT 1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM anfitriones WHERE email = 'jose.martinez@iguanasv.com') THEN
    INSERT INTO anfitriones (municipio_id, nombre, email, telefono, verificado)
    SELECT m.id, 'José Martínez', 'jose.martinez@iguanasv.com', '+503 7345 6789', true
    FROM municipios m WHERE m.nombre = 'Suchitoto' LIMIT 1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM anfitriones WHERE email = 'ana.rivera@iguanasv.com') THEN
    INSERT INTO anfitriones (municipio_id, nombre, email, telefono, verificado)
    SELECT m.id, 'Ana Rivera', 'ana.rivera@iguanasv.com', '+503 7456 7890', false
    FROM municipios m WHERE m.nombre = 'La Libertad' LIMIT 1;
  END IF;
END $$;

-- ============================================================
-- 4. Publicaciones
-- ============================================================
DO $$
DECLARE
  v_anf1 INT;
  v_anf2 INT;
  v_anf3 INT;
  v_anf4 INT;
  v_cat_aventura INT;
  v_cat_surf INT;
  v_cat_cultura INT;
  v_cat_hospedaje INT;
  v_pub1 INT;
  v_pub2 INT;
  v_pub3 INT;
  v_pub4 INT;
  v_pub5 INT;
BEGIN
  SELECT id INTO v_anf1 FROM anfitriones WHERE email = 'carlos.lopez@iguanasv.com';
  SELECT id INTO v_anf2 FROM anfitriones WHERE email = 'maria.hernandez@iguanasv.com';
  SELECT id INTO v_anf3 FROM anfitriones WHERE email = 'jose.martinez@iguanasv.com';
  SELECT id INTO v_anf4 FROM anfitriones WHERE email = 'ana.rivera@iguanasv.com';

  SELECT id INTO v_cat_aventura FROM categorias WHERE nombre = 'Aventura';
  SELECT id INTO v_cat_surf FROM categorias WHERE nombre = 'Surf';
  SELECT id INTO v_cat_cultura FROM categorias WHERE nombre = 'Cultura';
  SELECT id INTO v_cat_hospedaje FROM categorias WHERE nombre = 'Hospedaje';

  IF NOT EXISTS (SELECT 1 FROM publicaciones WHERE titulo = 'Clases de Surf en El Tunco') THEN
    INSERT INTO publicaciones (anfitrion_id, categoria_id, titulo, descripcion, precio_por_noche, capacidad_maxima, direccion_exacta, estado)
    VALUES (v_anf4, v_cat_surf, 'Clases de Surf en El Tunco',
      'Aprende a surfear en las mejores olas de El Salvador con instructores certificados.',
      35.00, 8, 'Playa El Tunco, La Libertad', 'activo')
    RETURNING id INTO v_pub1;
  ELSE
    SELECT id INTO v_pub1 FROM publicaciones WHERE titulo = 'Clases de Surf en El Tunco';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM publicaciones WHERE titulo = 'Tour del Café en Apaneca') THEN
    INSERT INTO publicaciones (anfitrion_id, categoria_id, titulo, descripcion, precio_por_noche, capacidad_maxima, direccion_exacta, estado)
    VALUES (v_anf2, v_cat_cultura, 'Tour del Café en Apaneca',
      'Recorrido por fincas de café en la Ruta de las Flores, con degustación incluida.',
      25.00, 12, 'Apaneca, Ahuachapán', 'activo')
    RETURNING id INTO v_pub2;
  ELSE
    SELECT id INTO v_pub2 FROM publicaciones WHERE titulo = 'Tour del Café en Apaneca';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM publicaciones WHERE titulo = 'Ascenso al Volcán Santa Ana') THEN
    INSERT INTO publicaciones (anfitrion_id, categoria_id, titulo, descripcion, precio_por_noche, capacidad_maxima, direccion_exacta, estado)
    VALUES (v_anf1, v_cat_aventura, 'Ascenso al Volcán Santa Ana',
      'Excursión guiada al cráter del volcán Ilamatepec con vistas espectaculares.',
      45.00, 10, 'Parque Nacional Cerro Verde, Santa Ana', 'activo')
    RETURNING id INTO v_pub3;
  ELSE
    SELECT id INTO v_pub3 FROM publicaciones WHERE titulo = 'Ascenso al Volcán Santa Ana';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM publicaciones WHERE titulo = 'Hostal Casa de Suchitoto') THEN
    INSERT INTO publicaciones (anfitrion_id, categoria_id, titulo, descripcion, precio_por_noche, capacidad_maxima, direccion_exacta, habitaciones, camas, banos, estado)
    VALUES (v_anf3, v_cat_hospedaje, 'Hostal Casa de Suchitoto',
      'Alojamiento colonial frente al lago de Suchitoto con desayuno incluido.',
      55.00, 6, 'Calle Los Heroes #5, Suchitoto', 3, 4, 2, 'activo')
    RETURNING id INTO v_pub4;
  ELSE
    SELECT id INTO v_pub4 FROM publicaciones WHERE titulo = 'Hostal Casa de Suchitoto';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM publicaciones WHERE titulo = 'Cabaña en la Ruta de las Flores') THEN
    INSERT INTO publicaciones (anfitrion_id, categoria_id, titulo, descripcion, precio_por_noche, capacidad_maxima, direccion_exacta, habitaciones, camas, banos, estado)
    VALUES (v_anf2, v_cat_hospedaje, 'Cabaña en la Ruta de las Flores',
      'Cabaña rústica con vista al valle, ideal para parejas y familias.',
      75.00, 4, 'Ruta de las Flores, Sonsonate', 2, 2, 1, 'activo')
    RETURNING id INTO v_pub5;
  ELSE
    SELECT id INTO v_pub5 FROM publicaciones WHERE titulo = 'Cabaña en la Ruta de las Flores';
  END IF;

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
    INSERT INTO horarios (publicacion_id, dia_semana, hora_inicio, hora_fin)
    VALUES
      (v_pub1, 1, '06:00', '10:00'),
      (v_pub1, 2, '06:00', '10:00'),
      (v_pub1, 3, '06:00', '10:00'),
      (v_pub1, 4, '06:00', '10:00'),
      (v_pub1, 5, '06:00', '10:00'),
      (v_pub1, 6, '06:00', '12:00'),
      (v_pub2, 1, '08:00', '12:00'),
      (v_pub2, 3, '08:00', '12:00'),
      (v_pub2, 5, '08:00', '12:00'),
      (v_pub2, 6, '08:00', '14:00'),
      (v_pub3, 2, '05:00', '10:00'),
      (v_pub3, 4, '05:00', '10:00'),
      (v_pub3, 6, '05:00', '10:00'),
      (v_pub4, 1, '14:00', '22:00'),
      (v_pub4, 2, '14:00', '22:00'),
      (v_pub4, 3, '14:00', '22:00'),
      (v_pub4, 4, '14:00', '22:00'),
      (v_pub4, 5, '14:00', '22:00'),
      (v_pub4, 6, '14:00', '22:00'),
      (v_pub4, 0, '14:00', '22:00');
  END IF;

  -- Publicación-Amenidades
  IF NOT EXISTS (SELECT 1 FROM publicacion_amenidad WHERE publicacion_id = v_pub1) THEN
    INSERT INTO publicacion_amenidad (publicacion_id, amenidad_id)
    SELECT v_pub1, id FROM amenidades WHERE nombre IN ('Wi-Fi', 'Terraza')
    UNION ALL
    SELECT v_pub2, id FROM amenidades WHERE nombre IN ('Wi-Fi', 'Desayuno incluido', 'Terraza')
    UNION ALL
    SELECT v_pub3, id FROM amenidades WHERE nombre IN ('Wi-Fi', 'Estacionamiento')
    UNION ALL
    SELECT v_pub4, id FROM amenidades WHERE nombre IN ('Wi-Fi', 'Desayuno incluido', 'Aire acondicionado', 'TV', 'Lavadora')
    UNION ALL
    SELECT v_pub5, id FROM amenidades WHERE nombre IN ('Wi-Fi', 'Cocina', 'Piscina', 'Estacionamiento', 'Pet Friendly');
  END IF;

  -- Reservas de ejemplo
  IF NOT EXISTS (SELECT 1 FROM reservas WHERE publicacion_id = v_pub4) THEN
    INSERT INTO reservas (publicacion_id, fecha_inicio, fecha_fin, monto_total, estado)
    VALUES
      (v_pub4, CURRENT_DATE - 10, CURRENT_DATE - 7, 165.00, 'completada'),
      (v_pub4, CURRENT_DATE + 5, CURRENT_DATE + 8, 165.00, 'confirmada'),
      (v_pub5, CURRENT_DATE + 10, CURRENT_DATE + 14, 300.00, 'pendiente');
  END IF;
END $$;
