using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IguanaSV.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddUsuarioDestinoToResena : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "UsuarioDestinoId",
                table: "resenas",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_resenas_UsuarioDestinoId",
                table: "resenas",
                column: "UsuarioDestinoId");

            migrationBuilder.AddForeignKey(
                name: "FK_resenas_usuarios_UsuarioDestinoId",
                table: "resenas",
                column: "UsuarioDestinoId",
                principalTable: "usuarios",
                principalColumn: "id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_resenas_usuarios_UsuarioDestinoId",
                table: "resenas");

            migrationBuilder.DropIndex(
                name: "IX_resenas_UsuarioDestinoId",
                table: "resenas");

            migrationBuilder.DropColumn(
                name: "UsuarioDestinoId",
                table: "resenas");
        }
    }
}
