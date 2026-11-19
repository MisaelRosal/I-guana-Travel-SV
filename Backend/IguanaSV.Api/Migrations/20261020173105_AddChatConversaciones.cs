using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace IguanaSV.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddChatConversaciones : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "conversaciones",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    viajero_usuario_id = table.Column<int>(type: "integer", nullable: false),
                    anfitrion_id = table.Column<int>(type: "integer", nullable: false),
                    ultimo_mensaje_en = table.Column<DateTime>(type: "timestamp without time zone", nullable: true),
                    ultimo_mensaje_texto = table.Column<string>(type: "text", nullable: true),
                    ultimo_leido_viajero_en = table.Column<DateTime>(type: "timestamp without time zone", nullable: true),
                    ultimo_leido_anfitrion_en = table.Column<DateTime>(type: "timestamp without time zone", nullable: true),
                    creado_en = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP")
                },
                constraints: table =>
                {
                    table.PrimaryKey("conversaciones_pkey", x => x.id);
                    table.ForeignKey(
                        name: "conversaciones_anfitrion_id_fkey",
                        column: x => x.anfitrion_id,
                        principalTable: "anfitriones",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "conversaciones_viajero_usuario_id_fkey",
                        column: x => x.viajero_usuario_id,
                        principalTable: "usuarios",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "mensajes",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    conversacion_id = table.Column<int>(type: "integer", nullable: false),
                    emisor_usuario_id = table.Column<int>(type: "integer", nullable: false),
                    publicacion_id = table.Column<int>(type: "integer", nullable: true),
                    mensaje = table.Column<string>(type: "text", nullable: false),
                    creado_en = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP")
                },
                constraints: table =>
                {
                    table.PrimaryKey("mensajes_pkey", x => x.id);
                    table.CheckConstraint("mensajes_mensaje_check", "char_length(mensaje) BETWEEN 1 AND 500");
                    table.ForeignKey(
                        name: "mensajes_conversacion_id_fkey",
                        column: x => x.conversacion_id,
                        principalTable: "conversaciones",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "mensajes_emisor_usuario_id_fkey",
                        column: x => x.emisor_usuario_id,
                        principalTable: "usuarios",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "mensajes_publicacion_id_fkey",
                        column: x => x.publicacion_id,
                        principalTable: "publicaciones",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "conversaciones_viajero_usuario_id_anfitrion_id_key",
                table: "conversaciones",
                columns: new[] { "viajero_usuario_id", "anfitrion_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "idx_conversaciones_anfitrion",
                table: "conversaciones",
                column: "anfitrion_id");

            migrationBuilder.CreateIndex(
                name: "idx_conversaciones_ultimo_mensaje",
                table: "conversaciones",
                column: "ultimo_mensaje_en",
                descending: new bool[0]);

            migrationBuilder.CreateIndex(
                name: "idx_mensajes_conversacion_creado",
                table: "mensajes",
                columns: new[] { "conversacion_id", "creado_en", "id" },
                descending: new[] { false, true, true });

            migrationBuilder.CreateIndex(
                name: "IX_mensajes_emisor_usuario_id",
                table: "mensajes",
                column: "emisor_usuario_id");

            migrationBuilder.CreateIndex(
                name: "IX_mensajes_publicacion_id",
                table: "mensajes",
                column: "publicacion_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "mensajes");

            migrationBuilder.DropTable(
                name: "conversaciones");
        }
    }
}
