using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IguanaSV.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddTipoPublicacionCategoria : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "tipo",
                table: "publicaciones",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValueSql: "'experiencia'::character varying");

            migrationBuilder.AddColumn<string>(
                name: "tipo",
                table: "categorias",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValueSql: "'experiencia'::character varying");

            migrationBuilder.CreateIndex(
                name: "idx_publicaciones_tipo",
                table: "publicaciones",
                column: "tipo");

            migrationBuilder.Sql("UPDATE categorias SET tipo = 'hospedaje' WHERE nombre = 'Cabaña'");
            migrationBuilder.Sql("UPDATE publicaciones SET tipo = (SELECT c.tipo FROM categorias c WHERE c.id = publicaciones.categoria_id)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "idx_publicaciones_tipo",
                table: "publicaciones");

            migrationBuilder.DropColumn(
                name: "tipo",
                table: "publicaciones");

            migrationBuilder.DropColumn(
                name: "tipo",
                table: "categorias");
        }
    }
}
