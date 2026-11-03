using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace IguanaSV.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddResenas : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "resenas_notificadas_en",
                table: "reservas",
                type: "timestamp without time zone",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "resenas",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    reserva_id = table.Column<int>(type: "integer", nullable: false),
                    publicacion_id = table.Column<int>(type: "integer", nullable: false),
                    usuario_id = table.Column<int>(type: "integer", nullable: false),
                    calificacion = table.Column<short>(type: "smallint", nullable: false),
                    comentario = table.Column<string>(type: "text", nullable: true),
                    respuesta_anfitrion = table.Column<string>(type: "text", nullable: true),
                    fecha_respuesta = table.Column<DateTime>(type: "timestamp without time zone", nullable: true),
                    creado_en = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP"),
                    actualizado_en = table.Column<DateTime>(type: "timestamp without time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("resenas_pkey", x => x.id);
                    table.CheckConstraint("resenas_calificacion_check", "calificacion >= 0 AND calificacion <= 5");
                    table.ForeignKey(
                        name: "resenas_publicacion_id_fkey",
                        column: x => x.publicacion_id,
                        principalTable: "publicaciones",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "resenas_reserva_id_fkey",
                        column: x => x.reserva_id,
                        principalTable: "reservas",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "resenas_usuario_id_fkey",
                        column: x => x.usuario_id,
                        principalTable: "usuarios",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "idx_resenas_publicacion",
                table: "resenas",
                column: "publicacion_id");

            migrationBuilder.CreateIndex(
                name: "idx_resenas_usuario",
                table: "resenas",
                column: "usuario_id");

            migrationBuilder.CreateIndex(
                name: "resenas_reserva_id_key",
                table: "resenas",
                column: "reserva_id",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "resenas");

            migrationBuilder.DropColumn(
                name: "resenas_notificadas_en",
                table: "reservas");
        }
    }
}
