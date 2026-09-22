using IguanaSV.Api.Auth;
using IguanaSV.Api.Entities;
using IguanaSV.Api.Infrastructure;
using IguanaSV.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace IguanaSV.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ReservaController : ControllerBase
{
    private readonly IguanasDbContext _context;

    public ReservaController(IguanasDbContext context)
    {
        _context = context;
    }

    // Owner-scoped list (W4): a plain user sees only their own reservations;
    // an admin sees every row. Reservations with a NULL owner (legacy rows the
    // W2 backfill could not match) are hidden from non-admins, so the guest-PII
    // leak of returning all rows is closed.
    [HttpGet]
    [Authorize]
    public async Task<ActionResult<IEnumerable<Reserva>>> GetReservas()
    {
        var query = _context.Reservas
            .Include(r => r.Publicacion)
                .ThenInclude(p => p.ImagenesPublicacions)
            .Include(r => r.Publicacion)
                .ThenInclude(p => p.Categoria)
            .Include(r => r.Publicacion)
                .ThenInclude(p => p.Horarios)
            .Include(r => r.ReservaHorarios)
            .Include(r => r.Notificaciones)
            .AsQueryable();

        if (!User.IsInRole(AuthConstants.AdminRole))
        {
            var sub = User.GetSubjectId();
            query = query.Where(r => r.UsuarioId.HasValue && r.UsuarioId == sub);
        }

        return await query.ToListAsync();
    }

    // Single reservation detail is PII (W4): owner-or-admin only. A non-owner
    // gets 404 rather than 403 so the existence of someone else's row is not
    // leaked through the status code. Orphan-NULL rows are never owned, so they
    // resolve to 404 for any non-admin subject.
    [HttpGet("{id}")]
    [Authorize]
    public async Task<ActionResult<Reserva>> GetReserva(int id)
    {
        var reserva = await _context.Reservas
            .Include(r => r.Publicacion)
                .ThenInclude(p => p.ImagenesPublicacions)
            .Include(r => r.Publicacion)
                .ThenInclude(p => p.Categoria)
            .Include(r => r.Publicacion)
                .ThenInclude(p => p.Horarios)
            .Include(r => r.ReservaHorarios)
            .Include(r => r.Notificaciones)
            .FirstOrDefaultAsync(r => r.Id == id);

        if (reserva == null)
        {
            return NotFound();
        }

        if (!User.IsInRole(AuthConstants.AdminRole))
        {
            var sub = User.GetSubjectId();
            if (!reserva.UsuarioId.HasValue || reserva.UsuarioId.Value != sub)
            {
                return NotFound();
            }
        }

        return reserva;
    }

    // Public availability windows (dates only, no guest data) stay anonymous:
    // the experience detail page renders them before any login.
    [HttpGet("disponibilidad/{publicacionId}")]
    public async Task<IActionResult> GetDisponibilidad(int publicacionId)
    {
        var reservasOcupadas = await _context.Reservas
            .Where(r => r.PublicacionId == publicacionId
                && r.Estado != "cancelada"
                && r.FechaFin >= DateOnly.FromDateTime(DateTime.Today))
            .Select(r => new { inicio = r.FechaInicio, fin = r.FechaFin })
            .ToListAsync();

        return Ok(reservasOcupadas);
    }

    // Edit (W4): binds CreateReservaDto, so the validator runs and only the
    // legitimate guest fields (dates, guests) change. PrecioTotal is recomputed
    // server-side; UsuarioId, Estado and the owning publication are never read
    // from the body. The W3b owner-or-admin gate still authorizes the mutation.
    [HttpPut("{id}")]
    [Authorize]
    public async Task<IActionResult> PutReserva(int id, CreateReservaDto dto)
    {
        var existente = await _context.Reservas
            .Include(r => r.ReservaHorarios)
            .FirstOrDefaultAsync(r => r.Id == id);

        if (existente == null)
        {
            return NotFound();
        }

        if (!CallerCanMutateReserva(existente))
        {
            return Forbid();
        }

        if (existente.FechaInicio <= DateOnly.FromDateTime(DateTime.Today).AddDays(1))
        {
            return BadRequest("No es posible editar una reserva cuando falta un día o menos para la fecha de entrada.");
        }

        if (dto.FechaFin < dto.FechaInicio)
        {
            return BadRequest("La fecha de fin debe ser mayor o igual a la fecha de inicio.");
        }

        // The reservation stays bound to its original publication; the client
        // cannot reparent it onto another host's listing.
        var publicacion = await _context.Publicaciones.FirstOrDefaultAsync(p => p.Id == existente.PublicacionId);
        if (publicacion == null)
        {
            return NotFound($"La publicacion con id {existente.PublicacionId} no existe.");
        }

        if (dto.NumeroHuespedes > publicacion.CapacidadMaxima)
        {
            return BadRequest($"La capacidad máxima de esta publicación es de {publicacion.CapacidadMaxima} personas.");
        }

        var hayConflicto = await _context.Reservas
            .AnyAsync(r => r.Id != id
                && r.PublicacionId == existente.PublicacionId
                && r.Estado != "cancelada"
                && r.FechaInicio <= dto.FechaFin
                && r.FechaFin >= dto.FechaInicio);

        if (hayConflicto)
        {
            return Conflict(new { mensaje = "Las fechas seleccionadas no están disponibles. Alguien ya reservó en ese rango de fechas." });
        }

        existente.FechaInicio = dto.FechaInicio;
        existente.FechaFin = dto.FechaFin;
        existente.NumeroHuespedes = dto.NumeroHuespedes;
        existente.PrecioTotal = CalcularPrecioTotal(
            publicacion, await GetPrecioAdicionalExperienciaAsync(publicacion),
            dto.FechaInicio, dto.FechaFin, dto.NumeroHuespedes);
        existente.UpdatedAt = DateTime.Now;

        try
        {
            await _context.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            return Conflict();
        }

        return NoContent();
    }

    // Create (W4): binds CreateReservaDto (validator finally runs), derives
    // UsuarioId from the token subject, recomputes PrecioTotal from the
    // authoritative publication, and pins Estado to "pendiente". The client's
    // own UsuarioId/PrecioTotal/Estado (if any) are never read.
    [HttpPost]
    [Authorize]
    public async Task<ActionResult<Reserva>> PostReserva(CreateReservaDto dto)
    {
        var publicacion = await _context.Publicaciones.FirstOrDefaultAsync(p => p.Id == dto.PublicacionId);
        if (publicacion == null)
        {
            return NotFound($"La publicacion con id {dto.PublicacionId} no existe.");
        }

        if (dto.FechaFin < dto.FechaInicio)
        {
            return BadRequest("La fecha de fin debe ser mayor o igual a la fecha de inicio.");
        }

        if (dto.NumeroHuespedes > publicacion.CapacidadMaxima)
        {
            return BadRequest($"La capacidad máxima de esta publicación es de {publicacion.CapacidadMaxima} personas.");
        }

        var hayConflicto = await _context.Reservas
            .AnyAsync(r => r.PublicacionId == dto.PublicacionId
                && r.Estado != "cancelada"
                && r.FechaInicio <= dto.FechaFin
                && r.FechaFin >= dto.FechaInicio);

        if (hayConflicto)
        {
            return Conflict(new { mensaje = "Las fechas seleccionadas no están disponibles. Alguien ya reservó en ese rango de fechas." });
        }

        var reserva = new Reserva
        {
            PublicacionId = dto.PublicacionId,
            UsuarioId = User.GetSubjectId(),
            NombreHuesped = dto.NombreHuesped,
            EmailHuesped = dto.EmailHuesped,
            TelefonoHuesped = dto.TelefonoHuesped,
            FechaInicio = dto.FechaInicio,
            FechaFin = dto.FechaFin,
            NumeroHuespedes = dto.NumeroHuespedes,
            PrecioTotal = CalcularPrecioTotal(
                publicacion, await GetPrecioAdicionalExperienciaAsync(publicacion),
                dto.FechaInicio, dto.FechaFin, dto.NumeroHuespedes),
            Estado = "pendiente",
        };

        _context.Reservas.Add(reserva);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetReserva), new { id = reserva.Id }, reserva);
    }

    [HttpPut("{id}/confirmar")]
    [Authorize]
    public async Task<IActionResult> ConfirmarReserva(int id)
    {
        var reserva = await _context.Reservas.FindAsync(id);

        if (reserva == null)
        {
            return NotFound();
        }

        if (!CallerCanMutateReserva(reserva))
        {
            return Forbid();
        }

        if (reserva.Estado != "pendiente")
        {
            return BadRequest(new { mensaje = $"La reserva ya tiene estado '{reserva.Estado}'. Solo se pueden confirmar reservas pendientes." });
        }

        reserva.Estado = "confirmada";
        reserva.UpdatedAt = DateTime.Now;

        try
        {
            await _context.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            return Conflict();
        }

        return Ok(new { mensaje = "Reserva confirmada exitosamente.", reserva });
    }

    [HttpPut("{id}/pagar")]
    [Authorize]
    public async Task<IActionResult> PagarReserva(int id, [FromBody] PagarReservaDto dto)
    {
        var reserva = await _context.Reservas.FindAsync(id);

        if (reserva == null)
        {
            return NotFound();
        }

        if (!CallerCanMutateReserva(reserva))
        {
            return Forbid();
        }

        if (reserva.Estado != "pendiente")
        {
            return BadRequest(new { mensaje = $"La reserva ya tiene estado '{reserva.Estado}'. Solo se pueden pagar reservas pendientes." });
        }

        reserva.Estado = "confirmada";
        reserva.MetodoPago = dto.MetodoPago;
        reserva.FechaPago = DateTime.Now;
        reserva.IdTransaccion = $"TXN-{Guid.NewGuid():N}".Substring(0, 20);
        reserva.UpdatedAt = DateTime.Now;

        try
        {
            await _context.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            return Conflict();
        }

        return Ok(new
        {
            mensaje = "Pago simulado exitosamente. Reserva confirmada.",
            reserva.Id,
            reserva.Estado,
            reserva.MetodoPago,
            reserva.FechaPago,
            reserva.IdTransaccion,
            reserva.PrecioTotal,
        });
    }

    [HttpPut("{id}/cancelar")]
    [Authorize]
    public async Task<IActionResult> CancelarReserva(int id)
    {
        var reserva = await _context.Reservas.FindAsync(id);

        if (reserva == null)
        {
            return NotFound();
        }

        if (!CallerCanMutateReserva(reserva))
        {
            return Forbid();
        }

        if (reserva.Estado == "cancelada")
        {
            return BadRequest(new { mensaje = "La reserva ya está cancelada." });
        }

        if (reserva.Estado == "completada")
        {
            return BadRequest(new { mensaje = "No se puede cancelar una reserva ya completada." });
        }

        if (reserva.FechaInicio <= DateOnly.FromDateTime(DateTime.Today))
        {
            return BadRequest(new { mensaje = "No se puede cancelar una reserva cuya fecha de inicio ya pasó o es hoy." });
        }

        reserva.Estado = "cancelada";
        reserva.UpdatedAt = DateTime.Now;

        try
        {
            await _context.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            return Conflict();
        }

        return Ok(new { mensaje = "Reserva cancelada exitosamente.", reserva });
    }

    [HttpDelete("{id}")]
    [Authorize]
    public async Task<IActionResult> DeleteReserva(int id)
    {
        var reserva = await _context.Reservas.FindAsync(id);

        if (reserva == null)
        {
            return NotFound();
        }

        if (!CallerCanMutateReserva(reserva))
        {
            return Forbid();
        }

        if (reserva.FechaInicio <= DateOnly.FromDateTime(DateTime.Today).AddDays(1))
        {
            return BadRequest("No es posible eliminar una reserva cuando falta un día o menos para la fecha de entrada.");
        }

        _context.Reservas.Remove(reserva);
        await _context.SaveChangesAsync();

        return NoContent();
    }

    /// <summary>
    /// Authoritative reservation price, always computed from the publication row
    /// and never taken from the request body (spec "Server-side price recompute").
    /// Lodging uses the half-open range <c>[check-in, check-out)</c> so the
    /// checkout day is free: nights = fecha_fin - fecha_inicio, clamped to at
    /// least 1 (a same-day request prices one night, matching the client).
    /// Experience: the spec ("experience: from the booked horario/experiencia
    /// price", reserva-ownership-enforcement §Server-side price recompute) does
    /// not close a formula and horarios carry no price column, so the unit price
    /// is <c>precio_por_noche + experiencias.precio_adicional</c> charged once per
    /// guest. When a publication defines several experiencia rows the first (by
    /// id) supplies the add-on, since the reservation does not select one.
    /// </summary>
    private static decimal CalcularPrecioTotal(
        Publicacione publicacion, decimal? precioAdicional,
        DateOnly fechaInicio, DateOnly fechaFin, int numeroHuespedes)
    {
        if (string.Equals(publicacion.Tipo, "hospedaje", StringComparison.OrdinalIgnoreCase))
        {
            var nights = fechaFin.DayNumber - fechaInicio.DayNumber;
            if (nights < 1)
            {
                nights = 1;
            }

            return publicacion.PrecioPorNoche * nights;
        }

        return (publicacion.PrecioPorNoche + (precioAdicional ?? 0m)) * numeroHuespedes;
    }

    /// <summary>
    /// Loads the add-on price for experience publications from the authoritative
    /// experiencias row; lodging never pays one, so it short-circuits to null.
    /// </summary>
    private async Task<decimal?> GetPrecioAdicionalExperienciaAsync(Publicacione publicacion)
    {
        if (!string.Equals(publicacion.Tipo, "experiencia", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        return await _context.Experiencias
            .Where(e => e.PublicacionId == publicacion.Id)
            .OrderBy(e => e.Id)
            .Select(e => e.PrecioAdicional)
            .FirstOrDefaultAsync();
    }

    /// <summary>
    /// Owner-or-admin gate for reservation mutations. Owner means the token
    /// subject equals <c>reservas.usuario_id</c>; rows with a NULL owner (legacy
    /// reservations the W2 backfill could not match) are admin-only. Landed in
    /// W3b and reused by W4's DTO-bound PUT; list/detail scoping is enforced
    /// separately in the GET actions above.
    /// </summary>
    private bool CallerCanMutateReserva(Reserva reserva)
    {
        if (User.IsInRole(AuthConstants.AdminRole))
        {
            return true;
        }

        var sub = User.GetSubjectId();
        return reserva.UsuarioId.HasValue && sub.HasValue && reserva.UsuarioId.Value == sub.Value;
    }
}