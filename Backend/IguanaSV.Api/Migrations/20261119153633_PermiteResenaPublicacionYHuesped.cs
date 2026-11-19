using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IguanaSV.Api.Migrations
{
    /// <inheritdoc />
    public partial class PermiteResenaPublicacionYHuesped : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "resenas_reserva_id_key",
                table: "resenas");

            migrationBuilder.CreateIndex(
                name: "resenas_reserva_huesped_key",
                table: "resenas",
                column: "reserva_id",
                unique: true,
                filter: "\"UsuarioDestinoId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "resenas_reserva_publica_key",
                table: "resenas",
                column: "reserva_id",
                unique: true,
                filter: "\"UsuarioDestinoId\" IS NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "resenas_reserva_huesped_key",
                table: "resenas");

            migrationBuilder.DropIndex(
                name: "resenas_reserva_publica_key",
                table: "resenas");

            migrationBuilder.CreateIndex(
                name: "resenas_reserva_id_key",
                table: "resenas",
                column: "reserva_id",
                unique: true);
        }
    }
}
