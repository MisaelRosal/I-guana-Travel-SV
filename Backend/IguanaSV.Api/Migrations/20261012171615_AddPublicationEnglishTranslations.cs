using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IguanaSV.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddPublicationEnglishTranslations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "descripcion_en",
                table: "publicaciones",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "titulo_en",
                table: "publicaciones",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "descripcion_en",
                table: "publicaciones");

            migrationBuilder.DropColumn(
                name: "titulo_en",
                table: "publicaciones");
        }
    }
}
