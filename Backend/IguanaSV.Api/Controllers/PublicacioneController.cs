using PublicacioneEntity = IguanaSV.Api.Entities.Publicacione;
using IguanaSV.Api.Entities;
using IguanaSV.Api.Infrastructure;
using IguanaSV.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace IguanaSV.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class PublicacioneController : ControllerBase
{
    private readonly IguanasDbContext _context;

    public PublicacioneController(IguanasDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<PublicacioneEntity>>> GetPublicaciones()
    {
        return await _context.Publicaciones
            .AsNoTracking()
            .Include(p => p.Anfitrion)
                .ThenInclude(a => a.Municipio)
                    .ThenInclude(m => m.Departamento)
            .Include(p => p.Municipio)
                .ThenInclude(m => m.Departamento)
            .Include(p => p.Categoria)
            .Include(p => p.Experiencia)
            .Include(p => p.Horarios)
            .Include(p => p.ImagenesPublicacions)
            .Include(p => p.PublicacionAmenidads)
                .ThenInclude(pa => pa.Amenidad)
            .ToListAsync();
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<PublicacioneEntity>> GetPublicacione(int id)
    {
        var publicacione = await _context.Publicaciones
            .AsNoTracking()
            .Include(p => p.Anfitrion)
                .ThenInclude(a => a.Municipio)
                    .ThenInclude(m => m.Departamento)
            .Include(p => p.Municipio)
                .ThenInclude(m => m.Departamento)
            .Include(p => p.Categoria)
            .Include(p => p.Experiencia)
            .Include(p => p.Horarios)
            .Include(p => p.ImagenesPublicacions)
            .Include(p => p.PublicacionAmenidads)
                .ThenInclude(pa => pa.Amenidad)
            .FirstOrDefaultAsync(p => p.Id == id);

        if (publicacione == null)
        {
            return NotFound();
        }

        return publicacione;
    }

    [HttpGet("anfitrion/{anfitrionId}")]
    public async Task<ActionResult<IEnumerable<Publicacione>>> GetPublicacionesByAnfitrion(int anfitrionId)
    {
        return await _context.Publicaciones
            .AsNoTracking()
            .Include(p => p.Anfitrion)
                .ThenInclude(a => a.Municipio)
                    .ThenInclude(m => m.Departamento)
            .Include(p => p.Municipio)
                .ThenInclude(m => m.Departamento)
            .Include(p => p.Categoria)
            .Include(p => p.Experiencia)
            .Include(p => p.Horarios)
            .Include(p => p.ImagenesPublicacions)
            .Include(p => p.PublicacionAmenidads)
                .ThenInclude(pa => pa.Amenidad)
            .Include(p => p.Reservas)
            .Where(p => p.AnfitrionId == anfitrionId)
            .ToListAsync();
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> PutPublicacione(int id, CreatePublicacioneDto dto)
    {
        var publicacione = await _context.Publicaciones.FindAsync(id);

        if (publicacione == null)
        {
            return NotFound();
        }

        if (!await _context.Anfitriones.AnyAsync(a => a.Id == dto.AnfitrionId))
        {
            return NotFound($"El anfitrion con id {dto.AnfitrionId} no existe.");
        }

        if (!await _context.Categorias.AnyAsync(c => c.Id == dto.CategoriaId))
        {
            return NotFound($"La categoria con id {dto.CategoriaId} no existe.");
        }

        if (dto.Tipo != null && dto.Tipo != "hospedaje" && dto.Tipo != "experiencia")
        {
            return BadRequest(new { mensaje = "El tipo debe ser 'hospedaje' o 'experiencia'." });
        }

        publicacione.AnfitrionId = dto.AnfitrionId;
        publicacione.CategoriaId = dto.CategoriaId;
        publicacione.Titulo = dto.Titulo;
        publicacione.Descripcion = dto.Descripcion;
        publicacione.PrecioPorNoche = dto.PrecioPorNoche;
        publicacione.CapacidadMaxima = dto.CapacidadMaxima;
        publicacione.Habitaciones = dto.Habitaciones;
        publicacione.Camas = dto.Camas;
        publicacione.Banos = dto.Banos;
        publicacione.DireccionExacta = dto.DireccionExacta;
        publicacione.Latitud = dto.Latitud;
        publicacione.Longitud = dto.Longitud;
        if (dto.Tipo != null)
        {
            publicacione.Tipo = dto.Tipo;
        }
        if (dto.MunicipioId.HasValue)
        {
            publicacione.MunicipioId = dto.MunicipioId;
        }
        publicacione.UpdatedAt = DateTime.Now;

        var existente = await _context.Publicaciones
            .Include(p => p.PublicacionAmenidads)
            .FirstOrDefaultAsync(p => p.Id == id);

        if (existente == null)
        {
            return NotFound();
        }

        existente.AnfitrionId = publicacione.AnfitrionId;
        existente.CategoriaId = publicacione.CategoriaId;
        existente.Tipo = publicacione.Tipo;
        existente.Titulo = publicacione.Titulo;
        existente.Descripcion = publicacione.Descripcion;
        existente.PrecioPorNoche = publicacione.PrecioPorNoche;
        existente.CapacidadMaxima = publicacione.CapacidadMaxima;
        existente.Habitaciones = publicacione.Habitaciones;
        existente.Camas = publicacione.Camas;
        existente.Banos = publicacione.Banos;
        existente.DireccionExacta = publicacione.DireccionExacta;
        existente.Latitud = publicacione.Latitud;
        existente.Longitud = publicacione.Longitud;
        existente.MunicipioId = publicacione.MunicipioId;
        existente.Estado = publicacione.Estado;

        var idsSolicitados = (dto.PublicacionAmenidads ?? new List<CreatePublicacionAmenidadDto>())
            .Where(pa => pa.AmenidadId != 0)
            .Select(pa => pa.AmenidadId)
            .ToHashSet();

        var aBorrar = existente.PublicacionAmenidads
            .Where(pa => !idsSolicitados.Contains(pa.AmenidadId))
            .ToList();
        _context.PublicacionAmenidads.RemoveRange(aBorrar);

        var idsExistentes = existente.PublicacionAmenidads.Select(pa => pa.AmenidadId).ToHashSet();
        foreach (var amenidadId in idsSolicitados)
        {
            if (!idsExistentes.Contains(amenidadId))
            {
                _context.PublicacionAmenidads.Add(new PublicacionAmenidad
                {
                    PublicacionId = id,
                    AmenidadId = amenidadId,
                });
            }
        }

        // Horarios: el frontend manda la lista completa, se reemplazan
        var horariosActuales = await _context.Horarios
            .Where(h => h.PublicacionId == id)
            .ToListAsync();
        _context.Horarios.RemoveRange(horariosActuales);

        foreach (var h in dto.Horarios ?? new List<CreateHorarioDto>())
        {
            _context.Horarios.Add(new Horario
            {
                PublicacionId = id,
                DiaSemana = h.DiaSemana,
                Fecha = h.Fecha,
                HoraInicio = h.HoraInicio,
                HoraFin = h.HoraFin,
            });
        }

        // Experiencia: mismo criterio, se reemplaza
        var experienciasActuales = await _context.Experiencias
            .Where(e => e.PublicacionId == id)
            .ToListAsync();
        _context.Experiencias.RemoveRange(experienciasActuales);

        foreach (var e in dto.Experiencia ?? new List<CreateExperienciaDto>())
        {
            _context.Experiencias.Add(new Experiencia
            {
                PublicacionId = id,
                Nombre = e.Nombre,
                Descripcion = e.Descripcion,
                DuracionHoras = e.DuracionHoras,
                PrecioAdicional = e.PrecioAdicional,
            });
        }

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

    [HttpPost]
    public async Task<ActionResult<PublicacioneEntity>> PostPublicacione(CreatePublicacioneDto dto)
    {
        if (!await _context.Anfitriones.AnyAsync(a => a.Id == dto.AnfitrionId))
        {
            return NotFound($"El anfitrion con id {dto.AnfitrionId} no existe.");
        }

        if (!await _context.Categorias.AnyAsync(c => c.Id == dto.CategoriaId))
        {
            return NotFound($"La categoria con id {dto.CategoriaId} no existe.");
        }

if (dto.Tipo != null && dto.Tipo != "hospedaje" && dto.Tipo != "experiencia")
        {
            return BadRequest(new { mensaje = "El tipo debe ser 'hospedaje' o 'experiencia'." });
        }

        if (dto.PrecioPorNoche < 0)
        {
            return BadRequest("El precio por noche no puede ser negativo.");
        }

        var publicacione = new PublicacioneEntity
        {
            AnfitrionId = dto.AnfitrionId,
            CategoriaId = dto.CategoriaId,
            Tipo = dto.Tipo ?? "experiencia",
            Titulo = dto.Titulo,
            Descripcion = dto.Descripcion,
            PrecioPorNoche = dto.PrecioPorNoche,
            CapacidadMaxima = dto.CapacidadMaxima,
            Habitaciones = dto.Habitaciones,
            Camas = dto.Camas,
            Banos = dto.Banos,
            DireccionExacta = dto.DireccionExacta,
            Latitud = dto.Latitud,
            Longitud = dto.Longitud,
            MunicipioId = dto.MunicipioId,
            Estado = dto.Estado ?? "activo",
            CreatedAt = DateTime.Now,
            UpdatedAt = DateTime.Now,
            Horarios = (dto.Horarios ?? new List<CreateHorarioDto>())
                .Select(h => new Horario
                {
                    DiaSemana = h.DiaSemana,
                    Fecha = h.Fecha,
                    HoraInicio = h.HoraInicio,
                    HoraFin = h.HoraFin,
                })
                .ToList(),
            Experiencia = (dto.Experiencia ?? new List<CreateExperienciaDto>())
                .Select(e => new Experiencia
                {
                    Nombre = e.Nombre,
                    Descripcion = e.Descripcion,
                    DuracionHoras = e.DuracionHoras,
                    PrecioAdicional = e.PrecioAdicional,
                })
                .ToList(),
            PublicacionAmenidads = (dto.PublicacionAmenidads ?? new List<CreatePublicacionAmenidadDto>())
                .Where(pa => pa.AmenidadId != 0)
                .Select(pa => new PublicacionAmenidad { AmenidadId = pa.AmenidadId })
                .ToList()
        };

        _context.Publicaciones.Add(publicacione);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetPublicacione), new { id = publicacione.Id }, publicacione);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeletePublicacione(int id)
    {
        var publicacione = await _context.Publicaciones.FindAsync(id);

        if (publicacione == null)
        {
            return NotFound();
        }

        _context.Publicaciones.Remove(publicacione);
        await _context.SaveChangesAsync();

        return NoContent();
    }
}
