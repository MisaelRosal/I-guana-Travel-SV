using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace IguanaSV.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddReportesHuesped : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "reportes",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    reserva_id = table.Column<int>(type: "integer", nullable: false),
                    publicacion_id = table.Column<int>(type: "integer", nullable: false),
                    anfitrion_id = table.Column<int>(type: "integer", nullable: false),
                    usuario_huesped_id = table.Column<int>(type: "integer", nullable: false),
                    tipo = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    descripcion = table.Column<string>(type: "text", nullable: false),
                    estado = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, defaultValueSql: "'pendiente'"),
                    creado_en = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP"),
                    resuelto_por_admin_id = table.Column<int>(type: "integer", nullable: true),
                    resuelto_en = table.Column<DateTime>(type: "timestamp without time zone", nullable: true),
                    notas_admin = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("reportes_pkey", x => x.id);
                    table.ForeignKey(
                        name: "reportes_anfitrion_id_fkey",
                        column: x => x.anfitrion_id,
                        principalTable: "anfitriones",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "reportes_publicacion_id_fkey",
                        column: x => x.publicacion_id,
                        principalTable: "publicaciones",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "reportes_reserva_id_fkey",
                        column: x => x.reserva_id,
                        principalTable: "reservas",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "reportes_resuelto_por_admin_id_fkey",
                        column: x => x.resuelto_por_admin_id,
                        principalTable: "usuarios",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "reportes_usuario_huesped_id_fkey",
                        column: x => x.usuario_huesped_id,
                        principalTable: "usuarios",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "reporte_evidencias",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    reporte_id = table.Column<int>(type: "integer", nullable: false),
                    url = table.Column<string>(type: "text", nullable: false),
                    nombre_archivo = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    content_type = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    creado_en = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP")
                },
                constraints: table =>
                {
                    table.PrimaryKey("reporte_evidencias_pkey", x => x.id);
                    table.ForeignKey(
                        name: "reporte_evidencias_reporte_id_fkey",
                        column: x => x.reporte_id,
                        principalTable: "reportes",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "idx_reporte_evidencias_reporte",
                table: "reporte_evidencias",
                column: "reporte_id");

            migrationBuilder.CreateIndex(
                name: "idx_reportes_anfitrion",
                table: "reportes",
                column: "anfitrion_id");

            migrationBuilder.CreateIndex(
                name: "idx_reportes_estado",
                table: "reportes",
                column: "estado");

            migrationBuilder.CreateIndex(
                name: "idx_reportes_huesped",
                table: "reportes",
                column: "usuario_huesped_id");

            migrationBuilder.CreateIndex(
                name: "idx_reportes_reserva",
                table: "reportes",
                column: "reserva_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_reportes_publicacion_id",
                table: "reportes",
                column: "publicacion_id");

            migrationBuilder.CreateIndex(
                name: "IX_reportes_resuelto_por_admin_id",
                table: "reportes",
                column: "resuelto_por_admin_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "reporte_evidencias");

            migrationBuilder.DropTable(
                name: "reportes");
        }
    }
}
