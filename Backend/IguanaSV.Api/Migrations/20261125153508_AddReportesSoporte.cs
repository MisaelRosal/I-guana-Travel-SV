using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace IguanaSV.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddReportesSoporte : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "reportes_soporte",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    usuario_id = table.Column<int>(type: "integer", nullable: true),
                    nombre = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    email = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    asunto = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    mensaje = table.Column<string>(type: "text", nullable: false),
                    estado = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, defaultValueSql: "'pendiente'"),
                    creado_en = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP"),
                    actualizado_en = table.Column<DateTime>(type: "timestamp without time zone", nullable: true),
                    notas_admin = table.Column<string>(type: "text", nullable: true),
                    resuelto_por_admin_id = table.Column<int>(type: "integer", nullable: true),
                    resuelto_en = table.Column<DateTime>(type: "timestamp without time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("reportes_soporte_pkey", x => x.id);
                    table.ForeignKey(
                        name: "reportes_soporte_resuelto_por_admin_id_fkey",
                        column: x => x.resuelto_por_admin_id,
                        principalTable: "usuarios",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "reportes_soporte_usuario_id_fkey",
                        column: x => x.usuario_id,
                        principalTable: "usuarios",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "idx_reportes_soporte_creado",
                table: "reportes_soporte",
                column: "creado_en");

            migrationBuilder.CreateIndex(
                name: "idx_reportes_soporte_estado",
                table: "reportes_soporte",
                column: "estado");

            migrationBuilder.CreateIndex(
                name: "IX_reportes_soporte_resuelto_por_admin_id",
                table: "reportes_soporte",
                column: "resuelto_por_admin_id");

            migrationBuilder.CreateIndex(
                name: "IX_reportes_soporte_usuario_id",
                table: "reportes_soporte",
                column: "usuario_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "reportes_soporte");
        }
    }
}
