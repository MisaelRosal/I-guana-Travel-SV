using System;

namespace IguanaSV.Api.Entities;

/// <summary>
/// One chat message inside a conversation. Content is stored verbatim in the
/// original language (no translation in v1). The text column is `mensaje`; the
/// property is named <see cref="Texto"/> because C# forbids a member with the
/// same name as its enclosing type. A message may carry the id of the publication
/// it was sent from (nullable, SetNull on listing deletion — the message
/// outlives the publication it references).
/// </summary>
public partial class Mensaje
{
    public int Id { get; set; }

    public int ConversacionId { get; set; }

    public int EmisorUsuarioId { get; set; }

    /// <summary>Optional publication context (never the experiencias PK).</summary>
    public int? PublicacionId { get; set; }

    /// <summary>Non-empty, max 500 chars (column `mensaje`; DB check + validator).</summary>
    public string Texto { get; set; } = null!;

    public DateTime CreadoEn { get; set; }

    public virtual Conversacione Conversacion { get; set; } = null!;

    public virtual Usuario EmisorUsuario { get; set; } = null!;

    public virtual Publicacione? Publicacion { get; set; }
}
