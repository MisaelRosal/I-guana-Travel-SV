using Microsoft.EntityFrameworkCore;
using IguanaSV.Api.Entities;

namespace IguanaSV.Api.Infrastructure;

public class IguanasDbContext : DbContext
{
    public IguanasDbContext(DbContextOptions<IguanasDbContext> options)
        : base(options)
    {
    }

    public virtual DbSet<Amenidade> Amenidades { get; set; }

    public virtual DbSet<Anfitrione> Anfitriones { get; set; }

    public virtual DbSet<Categoria> Categorias { get; set; }

    public virtual DbSet<Departamento> Departamentos { get; set; }

    public virtual DbSet<Experiencia> Experiencias { get; set; }

    public virtual DbSet<Horario> Horarios { get; set; }

    public virtual DbSet<ImagenesPublicacion> ImagenesPublicacions { get; set; }

    public virtual DbSet<Municipio> Municipios { get; set; }

    public virtual DbSet<Notificacione> Notificaciones { get; set; }

    public virtual DbSet<PublicacionAmenidad> PublicacionAmenidads { get; set; }

    public virtual DbSet<Publicacione> Publicaciones { get; set; }

    public virtual DbSet<Reserva> Reservas { get; set; }

    public virtual DbSet<ReservaHorario> ReservaHorarios { get; set; }

    public virtual DbSet<Usuario> Usuarios { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasPostgresExtension("btree_gist");

        modelBuilder.Entity<Amenidade>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("amenidades_pkey");

            entity.ToTable("amenidades");

            entity.HasIndex(e => e.Nombre, "amenidades_nombre_key").IsUnique();

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("CURRENT_TIMESTAMP")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("created_at");
            entity.Property(e => e.Icono)
                .HasMaxLength(50)
                .HasColumnName("icono");
            entity.Property(e => e.Nombre)
                .HasMaxLength(50)
                .HasColumnName("nombre");
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("CURRENT_TIMESTAMP")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("updated_at");
        });

        modelBuilder.Entity<Anfitrione>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("anfitriones_pkey");

            entity.ToTable("anfitriones");

            entity.HasIndex(e => e.Email, "anfitriones_email_key").IsUnique();

            entity.HasIndex(e => e.MunicipioId, "idx_anfitriones_municipio");

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("CURRENT_TIMESTAMP")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("created_at");
            entity.Property(e => e.Direccion).HasColumnName("direccion");
            entity.Property(e => e.Descripcion).HasColumnName("descripcion");
            entity.Property(e => e.Email)
                .HasMaxLength(150)
                .HasColumnName("email");
            entity.Property(e => e.FotoPerfil).HasColumnName("foto_perfil");
            entity.Property(e => e.MunicipioId).HasColumnName("municipio_id");
            entity.Property(e => e.Nombre)
                .HasMaxLength(100)
                .HasColumnName("nombre");
            entity.Property(e => e.Telefono)
                .HasMaxLength(20)
                .HasColumnName("telefono");
            entity.Property(e => e.UsuarioId).HasColumnName("usuario_id");
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("CURRENT_TIMESTAMP")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("updated_at");
            entity.Property(e => e.Verificado)
                .HasDefaultValue(false)
                .HasColumnName("verificado");

            entity.HasOne(d => d.Municipio).WithMany(p => p.Anfitriones)
                .HasForeignKey(d => d.MunicipioId)
                .OnDelete(DeleteBehavior.Restrict)
                .HasConstraintName("anfitriones_municipio_id_fkey");

            entity.HasOne(d => d.Usuario).WithMany()
                .HasForeignKey(d => d.UsuarioId)
                .OnDelete(DeleteBehavior.Restrict)
                .HasConstraintName("anfitriones_usuario_id_fkey");
        });

        modelBuilder.Entity<Categoria>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("categorias_pkey");

            entity.ToTable("categorias");

            entity.HasIndex(e => e.Nombre, "categorias_nombre_key").IsUnique();

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("CURRENT_TIMESTAMP")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("created_at");
            entity.Property(e => e.Descripcion).HasColumnName("descripcion");
            entity.Property(e => e.Nombre)
                .HasMaxLength(50)
                .HasColumnName("nombre");
            entity.Property(e => e.Tipo)
                .HasMaxLength(20)
                .HasDefaultValueSql("'experiencia'::character varying")
                .HasColumnName("tipo");
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("CURRENT_TIMESTAMP")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("updated_at");
        });

        modelBuilder.Entity<Departamento>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("departamentos_pkey");

            entity.ToTable("departamentos");

            entity.HasIndex(e => e.Nombre, "departamentos_nombre_key").IsUnique();

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("CURRENT_TIMESTAMP")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("created_at");
            entity.Property(e => e.Nombre)
                .HasMaxLength(100)
                .HasColumnName("nombre");
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("CURRENT_TIMESTAMP")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("updated_at");
        });

        modelBuilder.Entity<Experiencia>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("experiencias_pkey");

            entity.ToTable("experiencias");

            entity.HasIndex(e => e.PublicacionId, "idx_experiencias_publicacion");

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("CURRENT_TIMESTAMP")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("created_at");
            entity.Property(e => e.Descripcion).HasColumnName("descripcion");
            entity.Property(e => e.DuracionHoras).HasColumnName("duracion_horas");
            entity.Property(e => e.Nombre)
                .HasMaxLength(200)
                .HasColumnName("nombre");
            entity.Property(e => e.PrecioAdicional)
                .HasPrecision(10, 2)
                .HasDefaultValue(0m)
                .HasColumnName("precio_adicional");
            entity.Property(e => e.PublicacionId).HasColumnName("publicacion_id");
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("CURRENT_TIMESTAMP")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("updated_at");

            entity.HasOne(d => d.Publicacion).WithMany(p => p.Experiencia)
                .HasForeignKey(d => d.PublicacionId)
                .HasConstraintName("experiencias_publicacion_id_fkey");
        });

        modelBuilder.Entity<Horario>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("horarios_pkey");

            entity.ToTable("horarios");

            entity.HasIndex(e => e.PublicacionId, "idx_horarios_publicacion");

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("CURRENT_TIMESTAMP")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("created_at");
            entity.Property(e => e.DiaSemana).HasColumnName("dia_semana");
            entity.Property(e => e.Disponible)
                .HasDefaultValue(true)
                .HasColumnName("disponible");
            entity.Property(e => e.HoraFin).HasColumnName("hora_fin");
            entity.Property(e => e.HoraInicio).HasColumnName("hora_inicio");
            entity.Property(e => e.PublicacionId).HasColumnName("publicacion_id");
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("CURRENT_TIMESTAMP")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("updated_at");

            entity.HasOne(d => d.Publicacion).WithMany(p => p.Horarios)
                .HasForeignKey(d => d.PublicacionId)
                .HasConstraintName("horarios_publicacion_id_fkey");
        });

        modelBuilder.Entity<ImagenesPublicacion>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("imagenes_publicacion_pkey");

            entity.ToTable("imagenes_publicacion");

            entity.HasIndex(e => e.PublicacionId, "idx_imagenes_publicacion_publicacion");

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("CURRENT_TIMESTAMP")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("created_at");
            entity.Property(e => e.EsPrincipal)
                .HasDefaultValue(false)
                .HasColumnName("es_principal");
            entity.Property(e => e.Orden)
                .HasDefaultValue(0)
                .HasColumnName("orden");
            entity.Property(e => e.PublicacionId).HasColumnName("publicacion_id");
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("CURRENT_TIMESTAMP")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("updated_at");
            entity.Property(e => e.Url).HasColumnName("url");

            entity.HasOne(d => d.Publicacion).WithMany(p => p.ImagenesPublicacions)
                .HasForeignKey(d => d.PublicacionId)
                .HasConstraintName("imagenes_publicacion_publicacion_id_fkey");
        });

        modelBuilder.Entity<Municipio>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("municipios_pkey");

            entity.ToTable("municipios");

            entity.HasIndex(e => e.DepartamentoId, "idx_municipios_departamento");

            entity.HasIndex(e => new { e.DepartamentoId, e.Nombre }, "municipios_departamento_id_nombre_key").IsUnique();

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("CURRENT_TIMESTAMP")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("created_at");
            entity.Property(e => e.DepartamentoId).HasColumnName("departamento_id");
            entity.Property(e => e.Nombre)
                .HasMaxLength(100)
                .HasColumnName("nombre");
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("CURRENT_TIMESTAMP")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("updated_at");

            entity.HasOne(d => d.Departamento).WithMany(p => p.Municipios)
                .HasForeignKey(d => d.DepartamentoId)
                .HasConstraintName("municipios_departamento_id_fkey");
        });

        modelBuilder.Entity<Notificacione>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("notificaciones_pkey");

            entity.ToTable("notificaciones");

            entity.HasIndex(e => e.DestinatarioEmail, "idx_notificaciones_destinatario");

            entity.HasIndex(e => e.ReservaId, "idx_notificaciones_reserva");

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("CURRENT_TIMESTAMP")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("created_at");
            entity.Property(e => e.DestinatarioEmail)
                .HasMaxLength(150)
                .HasColumnName("destinatario_email");
            entity.Property(e => e.Leida)
                .HasDefaultValue(false)
                .HasColumnName("leida");
            entity.Property(e => e.Mensaje).HasColumnName("mensaje");
            entity.Property(e => e.ReservaId).HasColumnName("reserva_id");
            entity.Property(e => e.Tipo)
                .HasMaxLength(30)
                .HasColumnName("tipo");
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("CURRENT_TIMESTAMP")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("updated_at");

            entity.HasOne(d => d.Reserva).WithMany(p => p.Notificaciones)
                .HasForeignKey(d => d.ReservaId)
                .HasConstraintName("notificaciones_reserva_id_fkey");
        });

        modelBuilder.Entity<PublicacionAmenidad>(entity =>
        {
            entity.HasKey(e => new { e.PublicacionId, e.AmenidadId }).HasName("publicacion_amenidad_pkey");

            entity.ToTable("publicacion_amenidad");

            entity.Property(e => e.PublicacionId).HasColumnName("publicacion_id");
            entity.Property(e => e.AmenidadId).HasColumnName("amenidad_id");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("CURRENT_TIMESTAMP")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("created_at");

            entity.HasOne(d => d.Amenidad).WithMany(p => p.PublicacionAmenidads)
                .HasForeignKey(d => d.AmenidadId)
                .HasConstraintName("publicacion_amenidad_amenidad_id_fkey");

            entity.HasOne(d => d.Publicacion).WithMany(p => p.PublicacionAmenidads)
                .HasForeignKey(d => d.PublicacionId)
                .HasConstraintName("publicacion_amenidad_publicacion_id_fkey");
        });

        modelBuilder.Entity<Publicacione>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("publicaciones_pkey");

            entity.ToTable("publicaciones");

            entity.HasIndex(e => e.AnfitrionId, "idx_publicaciones_anfitrion");

            entity.HasIndex(e => e.CategoriaId, "idx_publicaciones_categoria");

            entity.HasIndex(e => e.Estado, "idx_publicaciones_estado");

            entity.HasIndex(e => e.Tipo, "idx_publicaciones_tipo");

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.AnfitrionId).HasColumnName("anfitrion_id");
            entity.Property(e => e.Banos)
                .HasDefaultValue(1)
                .HasColumnName("banos");
            entity.Property(e => e.Camas)
                .HasDefaultValue(1)
                .HasColumnName("camas");
            entity.Property(e => e.CapacidadMaxima).HasColumnName("capacidad_maxima");
            entity.Property(e => e.CategoriaId).HasColumnName("categoria_id");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("CURRENT_TIMESTAMP")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("created_at");
            entity.Property(e => e.Descripcion).HasColumnName("descripcion");
            entity.Property(e => e.DireccionExacta).HasColumnName("direccion_exacta");
            entity.Property(e => e.Estado)
                .HasMaxLength(20)
                .HasDefaultValueSql("'activo'::character varying")
                .HasColumnName("estado");
            entity.Property(e => e.Habitaciones)
                .HasDefaultValue(1)
                .HasColumnName("habitaciones");
            entity.Property(e => e.Latitud)
                .HasPrecision(10, 8)
                .HasColumnName("latitud");
            entity.Property(e => e.Longitud)
                .HasPrecision(11, 8)
                .HasColumnName("longitud");
            entity.Property(e => e.MunicipioId).HasColumnName("municipio_id");
            entity.Property(e => e.PrecioPorNoche)
                .HasPrecision(10, 2)
                .HasColumnName("precio_por_noche");
            entity.Property(e => e.Titulo)
                .HasMaxLength(200)
                .HasColumnName("titulo");
            entity.Property(e => e.Tipo)
                .HasMaxLength(20)
                .HasDefaultValueSql("'experiencia'::character varying")
                .HasColumnName("tipo");
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("CURRENT_TIMESTAMP")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("updated_at");

            entity.HasOne(d => d.Anfitrion).WithMany(p => p.Publicaciones)
                .HasForeignKey(d => d.AnfitrionId)
                .HasConstraintName("publicaciones_anfitrion_id_fkey");

            entity.HasOne(d => d.Categoria).WithMany(p => p.Publicaciones)
                .HasForeignKey(d => d.CategoriaId)
                .OnDelete(DeleteBehavior.Restrict)
                .HasConstraintName("publicaciones_categoria_id_fkey");

            entity.HasOne(d => d.Municipio).WithMany()
                .HasForeignKey(d => d.MunicipioId)
                .HasConstraintName("publicaciones_municipio_id_fkey");
        });

        modelBuilder.Entity<Reserva>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("reservas_pkey");

            entity.ToTable("reservas");

            entity.HasIndex(e => e.Estado, "idx_reservas_estado");

            entity.HasIndex(e => new { e.FechaInicio, e.FechaFin }, "idx_reservas_fechas");

            entity.HasIndex(e => e.PublicacionId, "idx_reservas_publicacion");

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("CURRENT_TIMESTAMP")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("created_at");
            entity.Property(e => e.EmailHuesped)
                .HasMaxLength(150)
                .HasColumnName("email_huesped");
            entity.Property(e => e.Estado)
                .HasMaxLength(20)
                .HasDefaultValueSql("'pendiente'::character varying")
                .HasColumnName("estado");
            entity.Property(e => e.FechaFin).HasColumnName("fecha_fin");
            entity.Property(e => e.FechaInicio).HasColumnName("fecha_inicio");
            entity.Property(e => e.NombreHuesped)
                .HasMaxLength(100)
                .HasColumnName("nombre_huesped");
            entity.Property(e => e.NumeroHuespedes).HasColumnName("numero_huespedes");
            entity.Property(e => e.PrecioTotal)
                .HasPrecision(10, 2)
                .HasColumnName("precio_total");
            entity.Property(e => e.PublicacionId).HasColumnName("publicacion_id");
            entity.Property(e => e.TelefonoHuesped)
                .HasMaxLength(20)
                .HasColumnName("telefono_huesped");
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("CURRENT_TIMESTAMP")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("updated_at");

            entity.HasOne(d => d.Publicacion).WithMany(p => p.Reservas)
                .HasForeignKey(d => d.PublicacionId)
                .HasConstraintName("reservas_publicacion_id_fkey");
        });

        modelBuilder.Entity<ReservaHorario>(entity =>
        {
            entity.HasKey(e => new { e.ReservaId, e.HorarioId }).HasName("reserva_horario_pkey");

            entity.ToTable("reserva_horario");

            entity.HasIndex(e => e.ReservaId, "idx_reserva_horario_reserva");

            entity.Property(e => e.ReservaId).HasColumnName("reserva_id");
            entity.Property(e => e.HorarioId).HasColumnName("horario_id");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("CURRENT_TIMESTAMP")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("created_at");

            entity.HasOne(d => d.Horario).WithMany(p => p.ReservaHorarios)
                .HasForeignKey(d => d.HorarioId)
                .HasConstraintName("reserva_horario_horario_id_fkey");

            entity.HasOne(d => d.Reserva).WithMany(p => p.ReservaHorarios)
                .HasForeignKey(d => d.ReservaId)
                .HasConstraintName("reserva_horario_reserva_id_fkey");
        });

        modelBuilder.Entity<Usuario>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("usuarios_pkey");

            entity.ToTable("usuarios");

            entity.HasIndex(e => e.Email, "usuarios_email_key").IsUnique();

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("CURRENT_TIMESTAMP")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("created_at");
            entity.Property(e => e.Apellido)
                .HasMaxLength(100)
                .HasColumnName("apellido");
            entity.Property(e => e.Nombre)
                .HasMaxLength(100)
                .HasColumnName("nombre");
            entity.Property(e => e.Email)
                .HasMaxLength(150)
                .HasColumnName("email");
            entity.Property(e => e.PasswordHash).HasColumnName("password_hash");
            entity.Property(e => e.Rol)
                .HasMaxLength(20)
                .HasDefaultValueSql("'usuario'::character varying")
                .HasColumnName("rol");
            entity.Property(e => e.Telefono)
                .HasMaxLength(20)
                .HasColumnName("telefono");
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("CURRENT_TIMESTAMP")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("updated_at");
        });

        modelBuilder.Entity<Horario>()
            .HasIndex(h => new { h.PublicacionId, h.DiaSemana })
            .HasMethod("gist")
            .HasDatabaseName("horarios_no_overlap");

        modelBuilder.Entity<Reserva>()
            .HasIndex(r => r.PublicacionId)
            .HasMethod("gist")
            .HasDatabaseName("reservas_no_overlap");
    }
}