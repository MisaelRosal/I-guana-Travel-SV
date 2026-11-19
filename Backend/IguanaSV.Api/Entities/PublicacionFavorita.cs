using System;

namespace IguanaSV.Api.Entities;

/// <summary>
/// A publication saved by a user ("guardada"/favorita). The composite primary key
/// (usuario_id, publicacion_id) makes save/remove idempotent at the database level:
/// a repeated save simply has no effect, and both FKs cascade so a deleted user or
/// publication takes its saved rows with it.
/// </summary>
public partial class PublicacionFavorita
{
    public int UsuarioId { get; set; }

    public int PublicacionId { get; set; }

    public DateTime CreadoEn { get; set; }

    public virtual Publicacione Publicacion { get; set; } = null!;

    public virtual Usuario Usuario { get; set; } = null!;
}
