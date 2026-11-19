using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IguanaSV.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddPuntosTour : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "destino_latitud",
                table: "publicaciones",
                type: "numeric(10,8)",
                precision: 10,
                scale: 8,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "destino_longitud",
                table: "publicaciones",
                type: "numeric(11,8)",
                precision: 11,
                scale: 8,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "punto_encuentro_latitud",
                table: "publicaciones",
                type: "numeric(10,8)",
                precision: 10,
                scale: 8,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "punto_encuentro_longitud",
                table: "publicaciones",
                type: "numeric(11,8)",
                precision: 11,
                scale: 8,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "destino_latitud",
                table: "publicaciones");

            migrationBuilder.DropColumn(
                name: "destino_longitud",
                table: "publicaciones");

            migrationBuilder.DropColumn(
                name: "punto_encuentro_latitud",
                table: "publicaciones");

            migrationBuilder.DropColumn(
                name: "punto_encuentro_longitud",
                table: "publicaciones");
        }
    }
}
