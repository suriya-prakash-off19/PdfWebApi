using System;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using static PDFProcessorLibrary.PdfProcessor;
using System.Text;
using Newtonsoft.Json;
using System.Threading.Tasks;
namespace PdfWebApi;


[ApiController]
[Route("api/[controller]")]
public class HomeController : ControllerBase
{
    public HomeController(IWebHostEnvironment env)
    {
        _env = env;
    }
    private static byte[] TempByte = new byte[1];

    private static byte[] MemoryByte = new byte[1];

    private readonly IWebHostEnvironment _env;
    List<string> removeLayernames = new List<string>();
    List<string> removeColornames = new List<string>();

    [HttpPost("upload")]
    public IActionResult UploadData(IFormFile file)
    {
        try
        {
            if (file == null)
                return BadRequest("Invalid or missing file data.");
            byte[] pdfBytes = new byte[1];
            using (var ms = new MemoryStream())
            {
                file.CopyTo(ms);
                pdfBytes = ms.ToArray();
            }
            MemoryByte = pdfBytes;
            TempByte = pdfBytes;

            removeColornames.Clear();
            removeLayernames.Clear();

            string errorMsg = "";
            string[]? pdflayernames = null;
            string[]? pdfcolornames = null;
            bool[]? layervisibility = null;

            GetLayers(pdfBytes, LayerManipulationTool.iText7, ref pdflayernames, ref layervisibility, ref errorMsg);
            errorMsg = "";
            GetColorNames(pdfBytes, ref pdfcolornames, ColorSeparationTool.iText7, ref errorMsg);

            var response = new UploadResponse
            {
                LayerNames = pdflayernames?.Reverse().ToList() ?? new List<string>(),
                ColorNames = pdfcolornames?.Reverse().ToList() ?? new List<string>()
            };

            return Ok(response);
        }
        catch (FormatException ex)
        {
            return BadRequest("Invalid Base64 string: " + ex.Message);
        }
        catch (Exception ex)
        {
            // Log ex somewhere in production
            return StatusCode(500, "Internal server error: " + ex.Message);
        }
    }

    [HttpPost("updateLayer")]
    public IActionResult UpdateLayer([FromBody] UpdateRequest request)
    {
        removeLayernames = request.SelectedItems.ToList();
        return UpdatePDF();
    }

    [HttpPost("updateColor")]
    public IActionResult UpdateColor([FromBody] UpdateRequest request)
    {
        removeColornames = request.SelectedItems.ToList();
        return UpdatePDF();
    }


    [HttpPost("save")]
    public async Task<IActionResult> Save([FromBody] UploadRequest data)
    {
        if (data?.FileData == null)
            return BadRequest("Missing file data.");

        byte[] pdfBytes;
        try
        {
            pdfBytes = Convert.FromBase64String(data.FileData);
        }
        catch (FormatException ex)
        {
            return BadRequest("Invalid Base64: " + ex.Message);
        }

        TempByte = pdfBytes;
        var uploadsFolder = Path.Combine(_env.ContentRootPath, "Uploads");
        Directory.CreateDirectory(uploadsFolder);
        var fileName = $"{data.FileName}.pdf";
        var filePath = Path.Combine(uploadsFolder, fileName);

        await System.IO.File.WriteAllBytesAsync(filePath, pdfBytes);
        return Ok();
    }

    [HttpPost("updateObject")]
    public IActionResult UpdateObject([FromBody] PdfPointData data)
    {
        PdfPoint firstPoint = data.selectedpoint[0];
        float pdfX = (float)firstPoint.x;
        float pdfY = (float)firstPoint.y;
        int pageno = data.PageNo;
        string errorMsg = "";
        PDFProcessorLibrary.PdfObjectHandler.InitializeMemory(MemoryByte);
        bool res = PDFProcessorLibrary.PdfObjectHandler.RemoveObject(pdfX, pdfY, pageno, ref MemoryByte, ref errorMsg);
        if (res)
        {
            return UpdatePDF();
        }
        else
        {
            return BadRequest(errorMsg);
        }
    }

    [HttpGet]
    public IActionResult Get() => Ok("API is alive");


    private IActionResult UpdatePDF()
    {
        string? errorMsg = null;
        byte[] memorybytes = MemoryByte;

        //Layers
        if (removeLayernames.Count > 0)
        {
            foreach (var names in removeLayernames)
            {
                ChangeLayerVisibility(memorybytes, names, false, LayerManipulationTool.iText7,
                ref memorybytes, ref errorMsg);
            }
        }

        //Colors
        if (removeColornames.Count > 0)
        {
            RemoveColor(memorybytes, removeColornames.ToArray(), ColorSeparationTool.iText7, ref memorybytes, ref errorMsg);
        }

        if (errorMsg != null)
            return BadRequest(errorMsg);
        return File(memorybytes, "application/pdf");
    }
}
public class UploadRequest
{
    public string FileName { get; set; } = "";
    public string FileData { get; set; } = "";
}

public class UploadResponse
{
    public List<string> ImageData { get; set; } = new List<string>();
    public List<string> LayerNames { get; set; } = new List<string>();
    public List<bool> LayerVisibility { get; set; } = new List<bool>();
    public List<string> ColorNames { get; set; } = new List<string>();
}

public class UpdateRequest
{
    public List<string> SelectedItems { get; set; } = new List<string>();
}
public class PdfPoint
{
    public double x { get; set; }
    public double y { get; set; }
}

public class PdfPointData
{
    public List<PdfPoint> selectedpoint { get; set; } = new List<PdfPoint>();
    public int PageNo { get; set; }
}
