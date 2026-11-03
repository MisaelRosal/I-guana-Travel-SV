using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IguanaSV.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddNotificacionesSitioUsuario : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<int>(
                name: "reserva_id",
                table: "notificaciones",
                type: "integer",
                nullable: true,
                oldClrType: typeof(int),
                oldType: "integer");

            migrationBuilder.AddColumn<int>(
                name: "usuario_id",
                table: "notificaciones",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "idx_notificaciones_usuario",
                table: "notificaciones",
                column: "usuario_id");

            migrationBuilder.AddForeignKey(
                name: "notificaciones_usuario_id_fkey",
                table: "notificaciones",
                column: "usuario_id",
                principalTable: "usuarios",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "notificaciones_usuario_id_fkey",
                table: "notificaciones");

            migrationBuilder.DropIndex(
                name: "idx_notificaciones_usuario",
                table: "notificaciones");

            migrationBuilder.DropColumn(
                name: "usuario_id",
                table: "notificaciones");

            migrationBuilder.AlterColumn<int>(
                name: "reserva_id",
                table: "notificaciones",
                type: "integer",
                nullable: false,
                defaultValue: 0,
                oldClrType: typeof(int),
                oldType: "integer",
                oldNullable: true);
        }
    }
}
