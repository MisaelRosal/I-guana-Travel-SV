using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IguanaSV.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddReservaUsuarioOwnership : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "usuario_id",
                table: "reservas",
                type: "integer",
                nullable: true);

            // Backfill ownership from the guest email. Matching is trimmed and
            // case-insensitive; usuarios.email is UNIQUE so a row can never fan out
            // to more than one user. Reservations whose email matches no user keep
            // usuario_id NULL (orphans are preserved, never deleted).
            migrationBuilder.Sql(
                "UPDATE reservas r " +
                "SET usuario_id = u.id " +
                "FROM usuarios u " +
                "WHERE lower(btrim(r.email_huesped)) = lower(btrim(u.email));");

            migrationBuilder.CreateIndex(
                name: "idx_reservas_usuario",
                table: "reservas",
                column: "usuario_id");

            migrationBuilder.AddForeignKey(
                name: "reservas_usuario_id_fkey",
                table: "reservas",
                column: "usuario_id",
                principalTable: "usuarios",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "reservas_usuario_id_fkey",
                table: "reservas");

            migrationBuilder.DropIndex(
                name: "idx_reservas_usuario",
                table: "reservas");

            migrationBuilder.DropColumn(
                name: "usuario_id",
                table: "reservas");
        }
    }
}
