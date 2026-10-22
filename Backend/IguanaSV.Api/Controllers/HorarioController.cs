using HorarioEntity = IguanaSV.Api.Entities.Horario;
using IguanaSV.Api.Auth;
using IguanaSV.Api.Infrastructure;
using IguanaSV.Api.Models;
using IguanaSV.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace IguanaSV.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class HorarioController : ControllerBase
{
    private readonly IguanasDbContext _context;
    private readonly IEmailNotificationService _notificaciones;

    public HorarioController(IguanasDbContext context, IEmailNotificationService notificaciones)
    {
        _context = context;
        _notificaciones = notificaciones;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<HorarioEntity>>> GetHorarios()
    {
        return await _context.Horarios
            .Include(h => h.Publicacion)
            .Include(h => h.ReservaHorarios)
            .ToListAsync();
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<HorarioEntity>> GetHorario(int id)
    {
        var horario = await _context.Horarios
            .Include(h => h.Publicacion)
            .Include(h => h.ReservaHorarios)
            .FirstOrDefaultAsync(h => h.Id == id);

        if (horario == null)
        {
            return NotFound();
        }

        return horario;
    }

    [Authorize]
    [HttpPut("{id}")]
    public async Task<IActionResult> PutHorario(int id, CreateHorarioDto dto)
    {
        var horario = await _context.Horarios.FindAsync(id);

        if (horario == null)
        {
            return NotFound();
        }

        if (!await _context.Publicaciones.AnyAsync(p => p.Id == dto.PublicacionId))
        {
            return NotFound($"La publicacion con id {dto.PublicacionId} no existe.");
        }

        // Owner-or-admin gate (spec: "Publication ownership gate"): a non-admin
        // must own both the horario's current publication and the target one.
        if (!User.IsInRole(AuthConstants.AdminRole))
        {
            if (!await CallerOwnsPublicationAsync(horario.PublicacionId)
                || !await CallerOwnsPublicationAsync(dto.PublicacionId))
            {
                return Forbid();
            }
        }

        var tieneReservas = horario.Fecha != null
            && await _context.Reservas.AnyAsync(r => r.PublicacionId == horario.PublicacionId
                && r.FechaInicio == horario.Fecha
                && (r.Estado == null || (r.Estado != "cancelada" && r.Estado != "completada")));

        if (tieneReservas
            && (dto.PublicacionId != horario.PublicacionId
                || dto.Fecha != horario.Fecha
                || dto.HoraInicio != horario.HoraInicio
                || dto.HoraFin != horario.HoraFin))
        {
            return Conflict(new
            {
                mensaje = "Esa fecha tiene reservas activas. Cambiá la fecha desde el gestor de disponibilidad para reprogramar a los huéspedes.",
            });
        }

        horario.PublicacionId = dto.PublicacionId;
        horario.DiaSemana = dto.DiaSemana;
        horario.Fecha = dto.Fecha;
        horario.HoraInicio = dto.HoraInicio;
        horario.HoraFin = dto.HoraFin;
        horario.Disponible = dto.Disponible ?? horario.Disponible ?? true;
        horario.Cupos = dto.Cupos;
        horario.UpdatedAt = DateTime.Now;

        _context.Entry(horario).State = EntityState.Modified;

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

    // A host changing the date of a dated slot with active bookings must go
    // through this action: it moves the reservations with the slot and emails
    // every guest, who keeps the booking unless they choose to cancel it.
    [Authorize]
    [HttpPost("{id}/reprogramar")]
    public async Task<IActionResult> ReprogramarHorario(int id, ReprogramarHorarioDto dto)
    {
        if (dto == null || dto.NuevaFecha == default)
        {
            return BadRequest(new { mensaje = "Tenés que indicar la nueva fecha." });
        }

        var publicacionId = await _context.Horarios
            .Where(h => h.Id == id)
            .Select(h => (int?)h.PublicacionId)
            .FirstOrDefaultAsync();

        if (publicacionId == null)
        {
            return NotFound();
        }

        var publicacion = await _context.Publicaciones.FirstOrDefaultAsync(p => p.Id == publicacionId.Value);
        if (publicacion == null)
        {
            return NotFound($"La publicacion con id {publicacionId.Value} no existe.");
        }

        if (!User.IsInRole(AuthConstants.AdminRole) && !await CallerOwnsPublicationAsync(publicacion.Id))
        {
            return Forbid();
        }

        if (!string.Equals(publicacion.Tipo, "experiencia", StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest(new { mensaje = "Solo las experiencias se pueden reprogramar por fecha." });
        }

        var fechaNueva = dto.NuevaFecha;
        var hoy = DateOnly.FromDateTime(DateTime.Today);

        // The whole move (slot + reservations + emails) is serialized per
        // publication against new bookings, so a guest cannot slip a booking
        // into the old date while it is being rescheduled.
        await using var tx = await _context.Database.BeginTransactionAsync();

        await _context.Database.ExecuteSqlRawAsync(
            "SELECT pg_advisory_xact_lock({0}::bigint)", publicacion.Id);

        var horario = await _context.Horarios.FirstAsync(h => h.Id == id);

        if (horario.Fecha == null)
        {
            return BadRequest(new { mensaje = "Ese horario no tiene una fecha concreta para reprogramar." });
        }

        var fechaVieja = horario.Fecha.Value;

        if (fechaNueva == fechaVieja)
        {
            return BadRequest(new { mensaje = "La nueva fecha tiene que ser distinta de la actual." });
        }

        if (fechaVieja < hoy)
        {
            return BadRequest(new { mensaje = "No se puede reprogramar una fecha que ya pasó." });
        }

        if (fechaNueva < hoy)
        {
            return BadRequest(new { mensaje = "La nueva fecha no puede estar en el pasado." });
        }

        // A single dated slot per day keeps the move unambiguous; reservations
        // are not linked to a time slot in the booking flow.
        var otroMismoDia = await _context.Horarios.AnyAsync(h =>
            h.PublicacionId == publicacion.Id && h.Id != horario.Id
            && (h.Fecha == fechaVieja || h.Fecha == fechaNueva));

        if (otroMismoDia)
        {
            return Conflict(new { mensaje = "Ese día tiene más de un horario. Dejá uno solo para poder reprogramarlo." });
        }

        var hayReservasDestino = await _context.Reservas.AnyAsync(r =>
            r.PublicacionId == publicacion.Id
            && r.FechaInicio == fechaNueva
            && (r.Estado == null || (r.Estado != "cancelada" && r.Estado != "completada")));

        if (hayReservasDestino)
        {
            return Conflict(new { mensaje = "La nueva fecha ya tiene reservas activas. Elegí otra fecha." });
        }

        var reservas = await _context.Reservas
            .Where(r => r.PublicacionId == publicacion.Id
                && r.FechaInicio == fechaVieja
                && (r.Estado == null || (r.Estado != "cancelada" && r.Estado != "completada")))
            .ToListAsync();

        var huespedes = reservas.Sum(r => r.NumeroHuespedes);
        var capacidad = horario.Cupos ?? publicacion.CapacidadMaxima;

        if (huespedes > capacidad)
        {
            return Conflict(new
            {
                mensaje = $"La nueva fecha tiene capacidad para {capacidad} personas y hay {huespedes} reservadas. Ajustá los cupos antes de reprogramar.",
            });
        }

        var ahora = DateTime.Now;
        horario.Fecha = fechaNueva;
        horario.UpdatedAt = ahora;

        foreach (var reserva in reservas)
        {
            reserva.FechaInicio = fechaNueva;
            reserva.FechaFin = fechaNueva;
            reserva.CancelacionLibre = true;
            reserva.ReprogramadaDesde = fechaVieja;
            reserva.ReprogramadaEn = ahora;
            // The old one-hour grace window belonged to the original short-notice
            // date; the guest now has unrestricted cancellation instead.
            reserva.FechaExpiracionGracia = null;
            reserva.UpdatedAt = ahora;
        }

        try
        {
            await _context.SaveChangesAsync();
            await tx.CommitAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            return Conflict();
        }

        var enviados = 0;
        var fallidos = 0;
        foreach (var reserva in reservas)
        {
            if (string.IsNullOrWhiteSpace(reserva.EmailHuesped))
            {
                fallidos++;
                continue;
            }

            var ok = await _notificaciones.ReservaReprogramadaAsync(
                reserva.EmailHuesped.Trim().ToLowerInvariant(),
                reserva.NombreHuesped ?? "huésped",
                publicacion.Titulo ?? "tu experiencia",
                fechaVieja,
                fechaNueva);

            if (ok)
            {
                enviados++;
            }
            else
            {
                fallidos++;
            }
        }

        return Ok(new
        {
            mensaje = reservas.Count == 0
                ? "Fecha reprogramada."
                : $"Fecha reprogramada y {reservas.Count} reserva(s) movida(s).",
            reservasMovidas = reservas.Count,
            correosEnviados = enviados,
            correosFallidos = fallidos,
            horarioId = horario.Id,
            fecha = fechaNueva,
        });
    }

    [Authorize]
    [HttpPost]
    public async Task<ActionResult<HorarioEntity>> PostHorario(CreateHorarioDto dto)
    {
        if (!await _context.Publicaciones.AnyAsync(p => p.Id == dto.PublicacionId))
        {
            return NotFound($"La publicacion con id {dto.PublicacionId} no existe.");
        }

        // A non-admin may only schedule under a publication they own.
        if (!User.IsInRole(AuthConstants.AdminRole) && !await CallerOwnsPublicationAsync(dto.PublicacionId))
        {
            return Forbid();
        }

        var horario = new HorarioEntity
        {
            PublicacionId = dto.PublicacionId,
            DiaSemana = dto.DiaSemana,
            Fecha = dto.Fecha,
            HoraInicio = dto.HoraInicio,
            HoraFin = dto.HoraFin,
            Disponible = dto.Disponible ?? true,
            Cupos = dto.Cupos,
            CreatedAt = DateTime.Now
        };

        _context.Horarios.Add(horario);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetHorario), new { id = horario.Id }, horario);
    }

    [Authorize]
    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteHorario(int id)
    {
        var horario = await _context.Horarios.FindAsync(id);

        if (horario == null)
        {
            return NotFound();
        }

        // Owner-or-admin gate (spec: "Publication ownership gate").
        if (!User.IsInRole(AuthConstants.AdminRole) && !await CallerOwnsPublicationAsync(horario.PublicacionId))
        {
            return Forbid();
        }

        if (horario.Fecha != null
            && await _context.Reservas.AnyAsync(r => r.PublicacionId == horario.PublicacionId
                && r.FechaInicio == horario.Fecha
                && (r.Estado == null || (r.Estado != "cancelada" && r.Estado != "completada"))))
        {
            return Conflict(new
            {
                mensaje = "Esa fecha tiene reservas activas. Reprogramala a otra fecha en vez de eliminarla.",
            });
        }

        _context.Horarios.Remove(horario);
        await _context.SaveChangesAsync();

        return NoContent();
    }

    /// <summary>True when the token subject owns the host behind the given publication.</summary>
    private async Task<bool> CallerOwnsPublicationAsync(int publicacionId)
    {
        var sub = User.GetSubjectId();
        return sub.HasValue
            && await _context.Publicaciones.AnyAsync(p => p.Id == publicacionId && p.Anfitrion!.UsuarioId == sub.Value);
    }
}
