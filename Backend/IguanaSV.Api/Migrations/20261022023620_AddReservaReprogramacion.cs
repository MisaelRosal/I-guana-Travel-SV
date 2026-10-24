using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IguanaSV.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddReservaReprogramacion : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "cancelacion_libre",
                table: "reservas",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateOnly>(
                name: "reprogramada_desde",
                table: "reservas",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "reprogramada_en",
                table: "reservas",
                type: "timestamp without time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "cancelacion_libre",
                table: "reservas");

            migrationBuilder.DropColumn(
                name: "reprogramada_desde",
                table: "reservas");

            migrationBuilder.DropColumn(
                name: "reprogramada_en",
                table: "reservas");
        }
    }
}
