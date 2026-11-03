using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IguanaSV.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddPublicacionesFavoritas : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "publicaciones_favoritas",
                columns: table => new
                {
                    usuario_id = table.Column<int>(type: "integer", nullable: false),
                    publicacion_id = table.Column<int>(type: "integer", nullable: false),
                    creado_en = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP")
                },
                constraints: table =>
                {
                    table.PrimaryKey("publicaciones_favoritas_pkey", x => new { x.usuario_id, x.publicacion_id });
                    table.ForeignKey(
                        name: "publicaciones_favoritas_publicacion_id_fkey",
                        column: x => x.publicacion_id,
                        principalTable: "publicaciones",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "publicaciones_favoritas_usuario_id_fkey",
                        column: x => x.usuario_id,
                        principalTable: "usuarios",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "idx_publicaciones_favoritas_publicacion",
                table: "publicaciones_favoritas",
                column: "publicacion_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "publicaciones_favoritas");
        }
    }
}
