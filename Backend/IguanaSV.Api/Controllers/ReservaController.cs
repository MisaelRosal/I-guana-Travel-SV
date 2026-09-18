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

    // Authenticated from W3b. Fine owner scoping (sub filter, orphan-NULL
    // hiding) lands with W4; admin already sees everything.
    [HttpGet]
    [Authorize]
    public async Task<ActionResult<IEnumerable<Reserva>>> GetReservas()
    {
        return await _context.Reservas
            .Include(r => r.Publicacion)
                .ThenInclude(p => p.ImagenesPublicacions)
            .Include(r => r.Publicacion)
                .ThenInclude(p => p.Categoria)
            .Include(r => r.Publicacion)
                .ThenInclude(p => p.Horarios)
            .Include(r => r.ReservaHorarios)
            .Include(r => r.Notificaciones)
            .ToListAsync();
    }

    // Reservation detail is PII: authenticated. The per-row owner check (IDOR
    // closure) lands with W4; until then the list is also authenticated-only.
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

    [HttpPut("{id}")]
    [Authorize]
    public async Task<IActionResult> PutReserva(int id, Reserva reserva)
    {
        if (id != reserva.Id)
        {
            return BadRequest();
        }

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

        if (reserva.FechaFin < reserva.FechaInicio)
        {
            return BadRequest("La fecha de fin debe ser mayor o igual a la fecha de inicio.");
        }

        var publicacion = await _context.Publicaciones.FirstOrDefaultAsync(p => p.Id == reserva.PublicacionId);
        if (publicacion == null)
        {
            return NotFound($"La publicacion con id {reserva.PublicacionId} no existe.");
        }

        if (reserva.NumeroHuespedes > publicacion.CapacidadMaxima)
        {
            return BadRequest($"La capacidad máxima de esta publicación es de {publicacion.CapacidadMaxima} personas.");
        }

        var hayConflicto = await _context.Reservas
            .AnyAsync(r => r.Id != id
                && r.PublicacionId == reserva.PublicacionId
                && r.Estado != "cancelada"
                && r.FechaInicio <= reserva.FechaFin
                && r.FechaFin >= reserva.FechaInicio);

        if (hayConflicto)
        {
            return Conflict(new { mensaje = "Las fechas seleccionadas no están disponibles. Alguien ya reservó en ese rango de fechas." });
        }

        existente.FechaInicio = reserva.FechaInicio;
        existente.FechaFin = reserva.FechaFin;
        existente.NumeroHuespedes = reserva.NumeroHuespedes;
        existente.PrecioTotal = reserva.PrecioTotal;
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

    // Authenticated from W3b. DTO binding (UsuarioId from sub, server-recomputed
    // price) is the W4 scope; the entity route stays open to its current body
    // shape until then.
    [HttpPost]
    [Authorize]
    public async Task<ActionResult<Reserva>> PostReserva(Reserva reserva)
    {
        var publicacion = await _context.Publicaciones.FirstOrDefaultAsync(p => p.Id == reserva.PublicacionId);
        if (publicacion == null)
        {
            return NotFound($"La publicacion con id {reserva.PublicacionId} no existe.");
        }

        if (reserva.FechaFin < reserva.FechaInicio)
        {
            return BadRequest("La fecha de fin debe ser mayor o igual a la fecha de inicio.");
        }

        if (reserva.NumeroHuespedes > publicacion.CapacidadMaxima)
        {
            return BadRequest($"La capacidad máxima de esta publicación es de {publicacion.CapacidadMaxima} personas.");
        }

        var hayConflicto = await _context.Reservas
            .AnyAsync(r => r.PublicacionId == reserva.PublicacionId
                && r.Estado != "cancelada"
                && r.FechaInicio <= reserva.FechaFin
                && r.FechaFin >= reserva.FechaInicio);

        if (hayConflicto)
        {
            return Conflict(new { mensaje = "Las fechas seleccionadas no están disponibles. Alguien ya reservó en ese rango de fechas." });
        }

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
    /// Owner-or-admin gate for reservation mutations. Owner means the token
    /// subject equals <c>reservas.usuario_id</c>; rows with a NULL owner (legacy
    /// reservations the W2 backfill could not match) are admin-only. Fine list
    /// scoping and DTO binding are W4 follow-ups.
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