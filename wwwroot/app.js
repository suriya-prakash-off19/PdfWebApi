pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js";

const sidebar = document.getElementById('sidebar');
const expandBtn = document.getElementById('expandBtn');
const collapseBtn = document.getElementById('collapseBtn');

expandBtn.addEventListener('click', () => {
    sidebar.classList.add('active');
    expandBtn.classList.add('hidden');
    setTimeout(() => fitPage(), 50);
});

collapseBtn.addEventListener('click', () => {
    sidebar.classList.remove('active');
    expandBtn.classList.remove('hidden');
    setTimeout(() => fitPage(), 50);
});

document.querySelectorAll(".collapsible").forEach(button => {
    button.addEventListener("click", () => {
        button.classList.toggle("active");
        const content = button.nextElementSibling;
        content.classList.toggle("show");
    });
});

// ================== Save Popup ===============
let updatedpdfstring = '';
const saveBtn = document.getElementById('saveBtn');
const popup = document.getElementById('saveConfirmPopup');
const yesBtn = document.getElementById('yesSave');
const noBtn = document.getElementById('noSave');

saveBtn.addEventListener('click', () => {
    popup.style.display = 'block';
});

yesBtn.addEventListener('click', () => {
    popup.style.display = 'none';
    SavePdf();
    popup.style.display = 'none';
    //window.close();
});

noBtn.addEventListener('click', () => {
    popup.style.display = 'none';
});

let updatedPdfBuffer = null;
// function SavePdf() {

//     const formData = new FormData();
//     formData.append("file", selectedFile);
//     const res = fetch("https://localhost:7040/api/home/Save", {
//         method: "POST",
//         body: formData
//     });

//     // const res = fetch("http://localhost:5001/Save", {
//     //     method: "POST",
//     //     headers: { "Content-Type": "application/json" },
//     //     body: JSON.stringify({ fileName: "UpdatedPDF", fileData: "updatedpdfstring" })
//     // });
// }

async function SavePdf() {
    try {
        // ✅ Check if you have modified PDF data (ArrayBuffer or Uint8Array)
        if (!updatedPdfBuffer && !selectedFile) {
            alert("No PDF data available to save!");
            return;
        }

        const formData = new FormData();

        // alert(updatedPdfBuffer instanceof ArrayBuffer, updatedPdfBuffer.byteLength);
        if (updatedPdfBuffer) {
            // console.log("updatedPdfBuffer:", updatedPdfBuffer);
            // console.log("Type:", updatedPdfBuffer.constructor.name);
            console.log("Size:", updatedPdfBuffer?.byteLength);
            // Convert ArrayBuffer → File so it behaves like uploaded file
            const modifiedFile = new File(
                [updatedPdfBuffer],
                selectedFile ? "Modified_" + selectedFile.name : "Modified.pdf",
                { type: "application/pdf" }
            );

            formData.append("file", modifiedFile);
            //formData.append("file", new File([updatedPdfBuffer], "Modified.pdf", { type: "application/pdf" }));

        } else {
            // Fallback to original file if nothing modified
            formData.append("file", selectedFile);
        }

        // ✅ Send via fetch
        const res = await fetch("https://localhost:7040/api/home/save", {
            method: "POST",
            body: formData
        });

        if (res.ok) {
            console.log("✅ Modified PDF uploaded successfully");
        } else {
            console.error("❌ Upload failed:", res.status, res.statusText);
        }
    } catch (err) {
        console.error("⚠️ Error saving PDF:", err);
    }
}


// =================== JS code ================
let selectedFile = null;
let scale = 1, posX = 0, posY = 0;
let isDragging = false, isRendering = false, panQueued = false, startX, startY;
let isFirstRender = true;

let pdfDoc = null, pageNum = 1;
let currentViewport = null;
const clickPoints = [];

const MIN_SCALE = 0.5;
const MAX_SCALE = 13.0;

// DOM
const container = document.getElementById('pdfContainer');
const canvas = document.getElementById('pdfCanvas');
const ctx = canvas.getContext('2d');
const pageNumEl = document.getElementById('pageNum');
const pageCountEl = document.getElementById('pageCount');

// document.getElementById("pdfInput").addEventListener("change", async function () {
//     if (this.files.length > 0) {
//         selectedFile = this.files[0];
//         const arrayBuffer = await selectedFile.arrayBuffer();
//         const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
//         loadingTask.promise.then(pdf => {
//             if (pdfDoc) {
//                 pdfDoc.cleanup();
//                 pdfDoc.destroy();
//                 pageCache.clear();
//             }
//             pdfDoc = pdf;
//             pageNum = 1;
//             pageCountEl.textContent = pdfDoc.numPages;
//             posX = 0; posY = 0; scale = 1.5;
//             clickPoints.length = 0; // clear previous points
//             isFirstRender = true;
//             fitPage();
//             //renderPage(pageNum, true);
//         }).catch(err => console.error(err));
//     }
//     sendPdf();
// });

document.getElementById("pdfInput").addEventListener("change", async function () {
    if (this.files.length > 0) {
        try {
            selectedFile = this.files[0];
            const arrayBuffer = await selectedFile.arrayBuffer();
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });

            // ✅ Wait for PDF to finish loading
            const pdf = await loadingTask.promise;

            if (pdfDoc) {
                pdfDoc.cleanup();
                pdfDoc.destroy();
                pageCache.clear();
            }

            pdfDoc = pdf;
            pageNum = 1;
            pageCountEl.textContent = pdfDoc.numPages;
            posX = 0; posY = 0; scale = 1.5;
            clickPoints.length = 0;
            isFirstRender = true;

            fitPage();
            //renderPage(pageNum, true);
        } catch (err) {
            console.error("PDF load error:", err);
        } finally {
            sendPdf();
        }
    }
});

function showLoading() {
    document.getElementById('loadingOverlay').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
}

const offscreenCanvas = document.createElement('canvas');
const offCtx = offscreenCanvas.getContext('2d');
const pageCache = new Map();

async function renderPage(num, center = false) {

    if (pageCache.has(num)) {
        drawFromCache(pageCache.get(num), center);
        return;
    }

    if (!pdfDoc) return;
    disableCheckboxes(true);
    isRendering = true;
    const page = await pdfDoc.getPage(num);

    // viewport with current scale
    currentViewport = page.getViewport({ scale: scale });

    // set offscreen canvas size
    offscreenCanvas.width = Math.round(currentViewport.width);
    offscreenCanvas.height = Math.round(currentViewport.height);

    // render PDF page to offscreen canvas
    await page.render({ canvasContext: offCtx, viewport: currentViewport }).promise;

    // copy to visible canvas
    canvas.width = offscreenCanvas.width;
    canvas.height = offscreenCanvas.height;

    // center if requested
    const containerRect = container.getBoundingClientRect();
    if (center) {
        posX = Math.max((containerRect.width - canvas.width) / 2, 0);
        posY = Math.max((containerRect.height - canvas.height) / 2, 0);
    }
    canvas.style.left = posX + 'px';
    canvas.style.top = posY + 'px';

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(offscreenCanvas, 0, 0);

    pageNumEl.textContent = num;
    isRendering = false;
    disableCheckboxes(false);
}

let images = [];
let currentIndex = 0;

// async function sendPdf() {
//     if (!selectedFile) { alert("Choose PDF to View"); return; }

//     showLoading();
//     try {
//         const formData = new FormData();
//         formData.append("file", selectedFile);
//         const res = await fetch("https://localhost:7040/api/home/upload", {
//             method: "POST",
//             body: formData
//         });

//         const data = await res.json();

//         const listContainer = document.getElementById("layercheckboxList");
//         listContainer.innerHTML = "";
//         (data.layerNames || []).forEach(item => {
//             const label = document.createElement("label");
//             label.style.display = "inline-block";
//             label.style.fontSize = "17px";
//             label.style.marginTop = "4px";
//             const checkbox = document.createElement("input");
//             checkbox.type = "checkbox";
//             checkbox.value = item;
//             checkbox.checked = true;
//             //checkbox.addEventListener("change", updateLayerSelection);
//             checkbox.addEventListener("change", () => debounceUpdate(updateLayerSelection));
//             label.appendChild(checkbox);
//             label.appendChild(document.createTextNode(" " + item));
//             listContainer.appendChild(label);
//             listContainer.appendChild(document.createElement("br"));
//         });

//         const listContainer2 = document.getElementById("colorcheckboxList");
//         listContainer2.innerHTML = "";
//         (data.colorNames || []).forEach(item => {
//             const label = document.createElement("label");
//             label.style.display = "inline-block";
//             label.style.fontSize = "17px";
//             label.style.marginTop = "4px";
//             const checkbox = document.createElement("input");
//             checkbox.type = "checkbox";
//             checkbox.value = item;
//             checkbox.checked = true;
//             //checkbox.addEventListener("change", updateColorSelection);
//             checkbox.addEventListener("change", () => debounceUpdate(updateColorSelection));
//             label.appendChild(checkbox);
//             label.appendChild(document.createTextNode(" " + item));
//             listContainer2.appendChild(label);
//             listContainer2.appendChild(document.createElement("br"));
//         });
//     } catch (err) {
//         console.error(err);
//     } finally {
//         hideLoading(); // hide spinner after processing
//     }
// }

async function sendPdf() {
    if (!selectedFile) {
        alert("Choose PDF to View");
        return;
    }

    showLoading();

    try {
        const CHUNK_SIZE = 50 * 1024 * 1024; // 50 MB per chunk (adjust as needed)
        const totalChunks = Math.ceil(selectedFile.size / CHUNK_SIZE);
        const uploadId = Date.now().toString(); // Unique ID for this upload

        for (let index = 0; index < totalChunks; index++) {
            const start = index * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, selectedFile.size);
            const chunk = selectedFile.slice(start, end);

            const formData = new FormData();
            formData.append("file", chunk);
            formData.append("fileName", selectedFile.name);
            formData.append("uploadId", uploadId);
            formData.append("chunkIndex", index);
            formData.append("totalChunks", totalChunks);

            const res = await fetch("https://localhost:7040/api/home/uploadChunk", {
                method: "POST",
                body: formData
            });

            if (!res.ok) {
                throw new Error(`Chunk ${index + 1} upload failed: ${res.statusText}`);
            }

            console.log(`✅ Uploaded chunk ${index + 1}/${totalChunks}`);
        }

        // 🔁 After all chunks uploaded, call merge endpoint
        const mergeRes = await fetch("https://localhost:7040/api/home/mergeChunks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                fileName: selectedFile.name,
                uploadId: uploadId
            })
        });

        if (!mergeRes.ok) throw new Error("Merge failed");

        const data = await mergeRes.json();

        // ✅ Continue your normal PDF loading flow
        const listContainer = document.getElementById("layercheckboxList");
        listContainer.innerHTML = "";
        (data.layerNames || []).forEach(item => {
            const label = document.createElement("label");
            label.style.display = "inline-block";
            label.style.fontSize = "17px";
            label.style.marginTop = "4px";
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.value = item;
            checkbox.checked = true;
            checkbox.addEventListener("change", () => debounceUpdate(updateLayerSelection));
            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(" " + item));
            listContainer.appendChild(label);
            listContainer.appendChild(document.createElement("br"));
        });

        const listContainer2 = document.getElementById("colorcheckboxList");
        listContainer2.innerHTML = "";
        (data.colorNames || []).forEach(item => {
            const label = document.createElement("label");
            label.style.display = "inline-block";
            label.style.fontSize = "17px";
            label.style.marginTop = "4px";
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.value = item;
            checkbox.checked = true;
            checkbox.addEventListener("change", () => debounceUpdate(updateColorSelection));
            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(" " + item));
            listContainer2.appendChild(label);
            listContainer2.appendChild(document.createElement("br"));
        });

    } catch (err) {
        console.error("⚠️ Upload failed:", err);
        alert("Upload failed: " + err.message);
    } finally {
        hideLoading();
    }
}

let updateTimer;
function debounceUpdate(fn) {
    clearTimeout(updateTimer);
    updateTimer = setTimeout(fn, 300);
}
const layercheckbox = document.getElementById('layercheckbox');
layercheckbox.addEventListener('change', function () {
    const layerCheckboxes = document.querySelectorAll("#layercheckboxList input[type='checkbox']");
    layerCheckboxes.forEach(cb => cb.checked = this.checked);
    updateLayerSelection();
});

function disableCheckboxes(disabled) {
    // const layercheckboxes = document.querySelectorAll('#layercheckboxList input[type="checkbox"]');
    // layercheckboxes.forEach(cb => cb.disabled = disabled);
    // const colorcheckboxes = document.querySelectorAll('#colorcheckboxList input[type="checkbox"]');
    // colorcheckboxes.forEach(cb => cb.disabled = disabled);
    // layercheckbox.disabled=disabled;
}

async function updateLayerSelection() {
    showLoading();
    try {
        const selectedItems = Array.from(document.querySelectorAll("#layercheckboxList input:not(:checked)"))
            .map(cb => cb.value);

        const res = await fetch("https://localhost:7040/api/home/updateLayer", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ selectedItems: selectedItems })
        });

        const arrayBuffer = await res.arrayBuffer(); // <— Directly get binary, no base64
        updatedPdfBuffer = arrayBuffer.slice(0);

        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;

        if (pdfDoc) {
            pdfDoc.cleanup();
            pdfDoc.destroy();
            pageCache.clear();
        }
        pdfDoc = pdf;
        pageCountEl.textContent = pdfDoc.numPages;
        // posX = 0;
        // posY = 0;
        // scale = 1.5;
        clickPoints.length = 0;
        isFirstRender = true;
        //renderPage(pageNum, false);
        scheduleRender(false);
        //await fitPage();
    } catch (err) {
        console.error(err);
    } finally {
        hideLoading();
    }
}

async function updateColorSelection() {
    showLoading();
    try {
        const selectedItems = Array.from(
            document.querySelectorAll("#colorcheckboxList input:not(:checked)")
        ).map(cb => cb.value);

        // Send JSON, receive raw PDF binary
        const res = await fetch("https://localhost:7040/api/home/updateColor", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ selectedItems }),
        });

        const arrayBuffer = await res.arrayBuffer(); // <— Directly get binary, no base64
        updatedPdfBuffer = arrayBuffer.slice(0);

        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;

        if (pdfDoc) {
            pdfDoc.cleanup();
            pdfDoc.destroy();
            pageCache.clear();
        }
        pdfDoc = pdf;
        pageCountEl.textContent = pdfDoc.numPages;
        // posX = 0;
        // posY = 0;
        // scale = 1.5;
        clickPoints.length = 0;
        isFirstRender = true;
        //renderPage(pageNum, false);
        await scheduleRender(false);
        //await fitPage();
    } catch (err) {
        console.error(err);
    } finally {
        hideLoading();
    }
}

async function updateObjectRemoval() {
    showLoading();
    try {
        const selectedPoints = clickPoints
            .filter(p => p.page === pageNum)
            .map(p => ({ x: p.pdfX, y: p.pdfY }));

        const res = await fetch("https://localhost:7040/api/home/updateObject", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ selectedpoint: selectedPoints, PageNo: pageNum })
        });


        const arrayBuffer = await res.arrayBuffer(); // <— Directly get binary, no base64
        updatedPdfBuffer = arrayBuffer.slice(0);

        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;

        if (pdfDoc) {
            pdfDoc.cleanup();
            pdfDoc.destroy();
            pageCache.clear();
        }
        pdfDoc = pdf;
        pageCountEl.textContent = pdfDoc.numPages;
        // posX = 0;
        // posY = 0;
        // scale = 1.5;
        clickPoints.length = 0;
        isFirstRender = true;
        //renderPage(pageNum, false);
        scheduleRender(false);

        //await fitPage();
    } catch (err) {
        console.error(err);
    } finally {
        hideLoading();
    }
}

let renderQueued = false;

async function scheduleRender(center = false) {
    if (!renderQueued) {
        renderQueued = true;
        requestAnimationFrame(async () => {
            await renderPage(pageNum, center);
            renderQueued = false;
        });
    }
}

function zoomAtCenter(zoomFactor) {
    if (!pdfDoc) return;

    const rect = container.getBoundingClientRect();

    // Visible center in container coordinates
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    // PDF-space coordinates of visible center before zoom
    const pdfX = (centerX - posX);
    const pdfY = (centerY - posY);

    const newScale = scale * zoomFactor;
    if (newScale > MAX_SCALE || newScale < MIN_SCALE) return;

    // Calculate ratio change
    const ratio = newScale / scale;
    scale = newScale;

    // Adjust posX/posY so the center stays fixed
    posX = centerX - pdfX * ratio;
    posY = centerY - pdfY * ratio;

    //renderPage(pageNum, false);
    scheduleRender(false);
}

document.getElementById('prevPage').addEventListener('click', () => {
    if (!pdfDoc || pageNum <= 1) return;
    pageNum--;
    fitPage();
    //renderPage(pageNum, true);
});

document.getElementById('nextPage').addEventListener('click', () => {
    if (!pdfDoc || pageNum >= pdfDoc.numPages) return;
    pageNum++;
    fitPage();
    // renderPage(pageNum, true);
});

document.getElementById('zoomIn').addEventListener('click', () => {
    if (isRendering) return;
    zoomAtCenter(1.2);
    //renderPage(pageNum, true);
});

document.getElementById('zoomOut').addEventListener('click', () => {
    if (isRendering) return;
    zoomAtCenter(1 / 1.2);
    // renderPage(pageNum, true);
});

document.getElementById('fitPage').addEventListener('click', async () => {
    fitPage();
});

async function fitPage() {
    if (!pdfDoc) return;

    const page = await pdfDoc.getPage(pageNum);
    const unscaled = page.getViewport({ scale: 1 });
    const containerRect = container.getBoundingClientRect();

    scale = Math.min(containerRect.width / unscaled.width, containerRect.height / unscaled.height);

    //renderPage(pageNum, true);
    scheduleRender(true);
}

container.addEventListener('mousedown', e => {
    // only start pan if clicked on canvas area
    // if (e.target !== canvas) return;
    if (e.target !== canvas || isRendering) return;
    isDragging = true;
    startX = e.clientX - posX;
    startY = e.clientY - posY;
    container.style.cursor = 'grabbing';
});

document.addEventListener('mousemove', e => {
    // if (!isDragging) return;
    if (!isDragging || isRendering) return;

    if (!panQueued) {
        panQueued = true;
        requestAnimationFrame(() => {
            posX = Math.round(e.clientX - startX);
            posY = Math.round(e.clientY - startY);
            canvas.style.left = posX + 'px';
            canvas.style.top = posY + 'px';
            panQueued = false;
        });
    }
});

document.addEventListener('mouseup', () => {
    if (isDragging) { isDragging = false; container.style.cursor = 'grab'; }
});

let zoomTimeout = null;
container.addEventListener('wheel', e => {
    if (!pdfDoc || isRendering) return;
    e.preventDefault();

    const rect = container.getBoundingClientRect(); // container bounds
    const mouseX = e.clientX - rect.left;          // mouse relative to container
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.12 : 1 / 1.12;

    // compute PDF-space coords of cursor BEFORE zoom
    const pdfX = (mouseX - posX) / scale;
    const pdfY = (mouseY - posY) / scale;

    // update scale
    if (scale * zoomFactor > MAX_SCALE || scale * zoomFactor < MIN_SCALE) {
        return;
    }

    scale *= zoomFactor;
    //scale = Math.min(Math.max(scale, MIN_SCALE), MAX_SCALE);

    // compute new offsets so PDF point under cursor stays fixed
    posX = mouseX - pdfX * scale;
    posY = mouseY - pdfY * scale;

    if (zoomTimeout) clearTimeout(zoomTimeout);
    zoomTimeout = setTimeout(() => {
        //renderPage(pageNum, false);
        scheduleRender(false);
    }, 50); // adjust 30-50ms
}, { passive: false });

canvas.addEventListener('click', e => {    
        clickPoints.length = 0;
    if (!currentViewport) return;
    // get click position relative to canvas top-left (this already accounts for canvas.style.left/top)
    const rect = canvas.getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;

    // Convert to PDF-space (unscaled PDF points)
    // const pdfX = canvasX / scale;
    // const pdfY = (canvas.height - canvasY) / scale; // invert Y to get bottom-left origin
    const [pdfX, pdfY] = currentViewport.convertToPdfPoint(canvasX, canvasY);
    // store and display
    clickPoints.push({ page: pageNum, pdfX: pdfX, pdfY: pdfY });
    // clickXEl.textContent = pdfX.toFixed(2);
    // clickYEl.textContent = pdfY.toFixed(2);
    const objectCheckbox = document.getElementById('objectcheckbox');

    if (e.ctrlKey && objectCheckbox.checked) {
        updateObjectRemoval();
    }
});