using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IguanaSV.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddPublicUserContentEnglishTranslations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "comentario_en",
                table: "resenas",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "respuesta_anfitrion_en",
                table: "resenas",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "descripcion_en",
                table: "experiencias",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "nombre_en",
                table: "experiencias",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "descripcion_en",
                table: "anfitriones",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "comentario_en",
                table: "resenas");

            migrationBuilder.DropColumn(
                name: "respuesta_anfitrion_en",
                table: "resenas");

            migrationBuilder.DropColumn(
                name: "descripcion_en",
                table: "experiencias");

            migrationBuilder.DropColumn(
                name: "nombre_en",
                table: "experiencias");

            migrationBuilder.DropColumn(
                name: "descripcion_en",
                table: "anfitriones");
        }
    }
}
