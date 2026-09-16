-- Experiencias futuras de ejemplo con las nuevas categorias (Música, Eventos deportivos, Fiestas)
-- Idempotente: usa ON CONFLICT / WHERE NOT EXISTS
-- Fechas relativas a CURRENT_DATE para que siempre sean futuras cercanas.

DO $$
DECLARE
  v_pub_musica INT;
  v_pub_deportes INT;
  v_pub_fiestas INT;
  v_cat_musica INT;
  v_cat_deportes INT;
  v_cat_fiestas INT;
BEGIN
  SELECT id INTO v_cat_musica FROM categorias WHERE nombre = 'Música';
  SELECT id INTO v_cat_deportes FROM categorias WHERE nombre = 'Eventos deportivos';
  SELECT id INTO v_cat_fiestas FROM categorias WHERE nombre = 'Fiestas';

  IF v_cat_musica IS NOT NULL AND NOT EXISTS (SELECT 1 FROM publicaciones WHERE titulo = 'Festival de Música en El Tunco') THEN
    INSERT INTO publicaciones (anfitrion_id, categoria_id, municipio_id, titulo, descripcion, precio_por_noche, capacidad_maxima, direccion_exacta, estado, tipo)
    VALUES (1, v_cat_musica, 1, 'Festival de Música en El Tunco',
      'Noche de conciertos al aire libre en la playa con bandas nacionales y DJ invitados.',
      30.00, 200, 'Playa El Tunco, La Libertad', 'activo', 'experiencia')
    RETURNING id INTO v_pub_musica;

    INSERT INTO experiencias (publicacion_id, nombre, descripcion, duracion_horas, precio_adicional)
    VALUES (v_pub_musica, 'Festival de música en vivo', 'Concierto al aire libre con bandas locales y zona de food trucks.', 5, 0.00);

    INSERT INTO imagenes_publicacion (publicacion_id, url, es_principal)
    VALUES (v_pub_musica, '/api/imagenes/rutasv/e624dc3b18fb4f8085f459d6e29c0b0c.jpg', true);

    INSERT INTO horarios (publicacion_id, fecha, hora_inicio, hora_fin, disponible)
    VALUES (v_pub_musica, CURRENT_DATE + 7, '17:00', '23:00', true);
  END IF;

  IF v_cat_deportes IS NOT NULL AND NOT EXISTS (SELECT 1 FROM publicaciones WHERE titulo = 'Torneo de Surf Santa Ana') THEN
    INSERT INTO publicaciones (anfitrion_id, categoria_id, municipio_id, titulo, descripcion, precio_por_noche, capacidad_maxima, direccion_exacta, estado, tipo)
    VALUES (4, v_cat_deportes, 214, 'Torneo de Surf Santa Ana',
      'Competencia de surf con categorías amateur y profesional, con entrada y hospedaje.',
      25.00, 100, 'Costanera de Santa Ana, El Faro', 'activo', 'experiencia')
    RETURNING id INTO v_pub_deportes;

    INSERT INTO experiencias (publicacion_id, nombre, descripcion, duracion_horas, precio_adicional)
    VALUES (v_pub_deportes, 'Torneo de surf', 'Día completo de competencias de surf con transporte desde la ciudad.', 8, 5.00);

    INSERT INTO imagenes_publicacion (publicacion_id, url, es_principal)
    VALUES (v_pub_deportes, '/api/imagenes/rutasv/0cf1f6747f204d6088fa6cd0cfdcdc80.jpg', true);

    INSERT INTO horarios (publicacion_id, fecha, hora_inicio, hora_fin, disponible)
    VALUES (v_pub_deportes, CURRENT_DATE + 12, '07:00', '17:00', true);
  END IF;

  IF v_cat_fiestas IS NOT NULL AND NOT EXISTS (SELECT 1 FROM publicaciones WHERE titulo = 'Noche de Carnaval en El Tunco') THEN
    INSERT INTO publicaciones (anfitrion_id, categoria_id, municipio_id, titulo, descripcion, precio_por_noche, capacidad_maxima, direccion_exacta, estado, tipo)
    VALUES (1, v_cat_fiestas, 1, 'Noche de Carnaval en El Tunco',
      'Fiesta temática con disfraces, comparsas y DJ hasta la madrugada en la playa.',
      20.00, 150, 'Malecón de El Tunco, La Libertad', 'activo', 'experiencia')
    RETURNING id INTO v_pub_fiestas;

    INSERT INTO experiencias (publicacion_id, nombre, descripcion, duracion_horas, precio_adicional)
    VALUES (v_pub_fiestas, 'Carnaval nocturno', 'Fiesta con comparsas, sorpresas y música en vivo.', 6, 0.00);

    INSERT INTO imagenes_publicacion (publicacion_id, url, es_principal)
    VALUES (v_pub_fiestas, '/api/imagenes/rutasv/576d7c2d6f6c47c4ba2b18a030a78d3b.png', true);

    INSERT INTO horarios (publicacion_id, fecha, hora_inicio, hora_fin, disponible)
    VALUES (v_pub_fiestas, CURRENT_DATE + 3, '20:00', '02:00', true);
  END IF;
END $$;