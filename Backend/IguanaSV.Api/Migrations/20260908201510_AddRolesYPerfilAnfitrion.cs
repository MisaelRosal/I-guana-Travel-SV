using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IguanaSV.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddRolesYPerfilAnfitrion : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "rol",
                table: "usuarios",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValueSql: "'usuario'::character varying");

            migrationBuilder.AddColumn<int>(
                name: "municipio_id",
                table: "publicaciones",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "descripcion",
                table: "anfitriones",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "foto_perfil",
                table: "anfitriones",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "usuario_id",
                table: "anfitriones",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_publicaciones_municipio_id",
                table: "publicaciones",
                column: "municipio_id");

            migrationBuilder.CreateIndex(
                name: "IX_anfitriones_usuario_id",
                table: "anfitriones",
                column: "usuario_id");

            migrationBuilder.AddForeignKey(
                name: "anfitriones_usuario_id_fkey",
                table: "anfitriones",
                column: "usuario_id",
                principalTable: "usuarios",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "publicaciones_municipio_id_fkey",
                table: "publicaciones",
                column: "municipio_id",
                principalTable: "municipios",
                principalColumn: "id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "anfitriones_usuario_id_fkey",
                table: "anfitriones");

            migrationBuilder.DropForeignKey(
                name: "publicaciones_municipio_id_fkey",
                table: "publicaciones");

            migrationBuilder.DropIndex(
                name: "IX_publicaciones_municipio_id",
                table: "publicaciones");

            migrationBuilder.DropIndex(
                name: "IX_anfitriones_usuario_id",
                table: "anfitriones");

            migrationBuilder.DropColumn(
                name: "rol",
                table: "usuarios");

            migrationBuilder.DropColumn(
                name: "municipio_id",
                table: "publicaciones");

            migrationBuilder.DropColumn(
                name: "descripcion",
                table: "anfitriones");

            migrationBuilder.DropColumn(
                name: "foto_perfil",
                table: "anfitriones");

            migrationBuilder.DropColumn(
                name: "usuario_id",
                table: "anfitriones");
        }
    }
}
