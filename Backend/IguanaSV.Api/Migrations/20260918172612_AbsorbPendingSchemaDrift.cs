using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IguanaSV.Api.Migrations
{
    /// <inheritdoc />
    public partial class AbsorbPendingSchemaDrift : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "reservas_no_overlap",
                table: "reservas");

            migrationBuilder.DropIndex(
                name: "horarios_no_overlap",
                table: "horarios");

            migrationBuilder.AddColumn<DateTime>(
                name: "fecha_pago",
                table: "reservas",
                type: "timestamp without time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "id_transaccion",
                table: "reservas",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "metodo_pago",
                table: "reservas",
                type: "character varying(30)",
                maxLength: 30,
                nullable: true);

            migrationBuilder.AlterColumn<int>(
                name: "dia_semana",
                table: "horarios",
                type: "integer",
                nullable: true,
                oldClrType: typeof(int),
                oldType: "integer");

            migrationBuilder.AddColumn<DateOnly>(
                name: "fecha",
                table: "horarios",
                type: "date",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "fecha_pago",
                table: "reservas");

            migrationBuilder.DropColumn(
                name: "id_transaccion",
                table: "reservas");

            migrationBuilder.DropColumn(
                name: "metodo_pago",
                table: "reservas");

            migrationBuilder.DropColumn(
                name: "fecha",
                table: "horarios");

            migrationBuilder.AlterColumn<int>(
                name: "dia_semana",
                table: "horarios",
                type: "integer",
                nullable: false,
                defaultValue: 0,
                oldClrType: typeof(int),
                oldType: "integer",
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "reservas_no_overlap",
                table: "reservas",
                column: "publicacion_id")
                .Annotation("Npgsql:IndexMethod", "gist");

            migrationBuilder.CreateIndex(
                name: "horarios_no_overlap",
                table: "horarios",
                columns: new[] { "publicacion_id", "dia_semana" })
                .Annotation("Npgsql:IndexMethod", "gist");
        }
    }
}
