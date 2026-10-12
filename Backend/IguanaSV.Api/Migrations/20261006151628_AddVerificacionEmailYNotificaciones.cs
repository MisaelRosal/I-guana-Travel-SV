using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace IguanaSV.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddVerificacionEmailYNotificaciones : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "email_verificado",
                table: "usuarios",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "notificaciones_email",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    usuario_id = table.Column<int>(type: "integer", nullable: true),
                    destinatario = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    asunto = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    tipo = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    estado = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, defaultValueSql: "'pendiente'::character varying"),
                    mensaje_error = table.Column<string>(type: "text", nullable: true),
                    creado_en = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP")
                },
                constraints: table =>
                {
                    table.PrimaryKey("notificaciones_email_pkey", x => x.id);
                    table.ForeignKey(
                        name: "notificaciones_email_usuario_id_fkey",
                        column: x => x.usuario_id,
                        principalTable: "usuarios",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "verificaciones_email",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    usuario_id = table.Column<int>(type: "integer", nullable: false),
                    codigo_hash = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    expira_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false),
                    usado = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    creado_en = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP")
                },
                constraints: table =>
                {
                    table.PrimaryKey("verificaciones_email_pkey", x => x.id);
                    table.ForeignKey(
                        name: "verificaciones_email_usuario_id_fkey",
                        column: x => x.usuario_id,
                        principalTable: "usuarios",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "idx_notificaciones_email_estado",
                table: "notificaciones_email",
                column: "estado");

            migrationBuilder.CreateIndex(
                name: "idx_notificaciones_email_usuario",
                table: "notificaciones_email",
                column: "usuario_id");

            migrationBuilder.CreateIndex(
                name: "idx_verificaciones_email_expira",
                table: "verificaciones_email",
                column: "expira_at");

            migrationBuilder.CreateIndex(
                name: "idx_verificaciones_email_usuario_usado",
                table: "verificaciones_email",
                columns: new[] { "usuario_id", "usado" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "notificaciones_email");

            migrationBuilder.DropTable(
                name: "verificaciones_email");

            migrationBuilder.DropColumn(
                name: "email_verificado",
                table: "usuarios");
        }
    }
}
