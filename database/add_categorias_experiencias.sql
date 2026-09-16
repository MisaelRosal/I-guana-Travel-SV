-- Nuevas categorias de experiencias: musicales, bailes, fiestas, eventos deportivos, etc.
-- Se insertan como tipo 'experiencia' para que aparezcan al crear publicaciones de experiencia.

INSERT INTO categorias (nombre, descripcion, tipo) VALUES
  ('Música', 'Conciertos, festivales musicales y experiencias relacionadas con la música.', 'experiencia'),
  ('Baile', 'Clases, talleres y presentaciones de baile y danza.', 'experiencia'),
  ('Fiestas', 'Fiestas, celebraciones y eventos sociales.', 'experiencia'),
  ('Eventos deportivos', 'Partidos, torneos y experiencias de deportes como espectador o participante.', 'experiencia'),
  ('Festivales', 'Ferias y festivales culturales y tradicionales.', 'experiencia'),
  ('Arte', 'Talleres, exposiciones y experiencias artísticas.', 'experiencia'),
  ('Teatro', 'Obras de teatro y presentaciones escénicas.', 'experiencia')
ON CONFLICT (nombre) DO NOTHING;