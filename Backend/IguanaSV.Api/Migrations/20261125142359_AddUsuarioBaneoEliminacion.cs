using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IguanaSV.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddUsuarioBaneoEliminacion : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "baneado",
                table: "usuarios",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "baneado_en",
                table: "usuarios",
                type: "timestamp without time zone",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "eliminado",
                table: "usuarios",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "eliminado_en",
                table: "usuarios",
                type: "timestamp without time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "baneado",
                table: "usuarios");

            migrationBuilder.DropColumn(
                name: "baneado_en",
                table: "usuarios");

            migrationBuilder.DropColumn(
                name: "eliminado",
                table: "usuarios");

            migrationBuilder.DropColumn(
                name: "eliminado_en",
                table: "usuarios");
        }
    }
}
