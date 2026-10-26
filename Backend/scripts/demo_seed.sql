INSERT INTO categorias (nombre, tipo)
VALUES
  ('Aventura', 'experiencia'),
  ('Surf', 'experiencia'),
  ('Cultura', 'experiencia'),
  ('Gastronomía', 'experiencia'),
  ('Naturaleza', 'experiencia'),
  ('Hospedaje', 'hospedaje')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO amenidades (nombre)
VALUES
  ('Wi-Fi'),
  ('Piscina'),
  ('Estacionamiento'),
  ('Aire acondicionado'),
  ('Cocina'),
  ('Desayuno incluido'),
  ('Terraza')
ON CONFLICT (nombre) DO NOTHING;
