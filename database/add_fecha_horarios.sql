-- Disponibilidad por fechas especificas para experiencias.
-- Las experiencias usan `fecha` (una fila por dia disponible).
-- `dia_semana` se conserva para hospedaje (fila con dia_semana = 0 guarda hora de entrada/salida),
-- por eso pasa a ser nullable.

ALTER TABLE horarios ADD COLUMN IF NOT EXISTS fecha DATE;
ALTER TABLE horarios ALTER COLUMN dia_semana DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_horarios_fecha ON horarios (publicacion_id, fecha);
