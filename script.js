// =================================================================
// 1. KONFIGURATION & UI-Elemente
// =================================================================
const API_URL = "https://nba2adew5h.execute-api.eu-west-1.amazonaws.com/prod/description/"; 
const LATEST_KEY_API = "https://nba2adew5h.execute-api.eu-west-1.amazonaws.com/prod/"; 
const S3_BASE_URL = "https://converter-input-moil.s3.eu-west-1.amazonaws.com/"; 

// UI Elemente
const analyseButton = document.getElementById('analyse-button');
const loadingStatus = document.getElementById('loading-status');
const imageContainer = document.getElementById('imageContainer');
const imgElement = document.getElementById('targetImage');
const labelsList = document.getElementById('labels-list');
const imageKeyDisplay = document.getElementById('image-key-display');


// =================================================================
// 2. STATUS-MANAGER: Verwaltet den Button- und Ladezustand
// =================================================================
function setStatus(isLoading, message) {
    if (isLoading) {
        analyseButton.disabled = true; 
        analyseButton.textContent = 'Analyse läuft...'; 
        loadingStatus.style.display = 'inline-block';
        imageKeyDisplay.textContent = message;
        labelsList.innerHTML = '<li>Daten werden abgerufen...</li>';
    } else {
        analyseButton.disabled = false; 
        analyseButton.textContent = 'Analyse starten (Automatisch)';
        loadingStatus.style.display = 'none';
    }
}


// =================================================================
// 3. HAUPTFUNKTION: Startet den gesamten Prozess (vom Button aufgerufen)
// =================================================================
async function startAnalysis() {
    setStatus(true, '1/3: Sucht nach neuestem Bild...');

    try {
        // --- 1. SCHRITT: Den neuesten Dateinamen abrufen ---
        const keyResponse = await fetch(LATEST_KEY_API);
        
        if (!keyResponse.ok) throw new Error("Fehler beim Abruf des neuesten Dateinamens.");

        const keyData = await keyResponse.json();
        const imageKey = keyData.key;
        
        if (!imageKey || imageKey === 'none') {
            alert("Es konnte kein Bild im S3 Bucket gefunden werden.");
            setStatus(false, '');
            return;
        }
        
        // --- 2. SCHRITT: Analyse-Daten abrufen ---
        setStatus(true, `2/3: Ruft Analyse für ${imageKey} ab...`);
        await analyzeImage(imageKey);
        
        // --- 3. SCHRITT: Erfolgreiche Anzeige ---
        setStatus(false, 'Analyse erfolgreich abgeschlossen.');

    } catch (e) {
        console.error("Fehler beim automatischen Prozess-Start:", e);
        setStatus(false, 'Analyse fehlgeschlagen. Erneut versuchen.');
        alert(`Der Prozess ist fehlgeschlagen. Prüfe die Konsole (F12).`);
    }
}


// =================================================================
// 4. DATEN-ANZEIGE: Labels und Konfidenzwerte neben dem Bild
// =================================================================
function displayAnalysisData(analysisData, imageKey) {
    imageKeyDisplay.textContent = `Aktuelles Bild: ${imageKey}`;
    labelsList.innerHTML = ''; // Liste leeren

    const labels = analysisData.Labels;

    if (labels && labels.length > 0) {
        labels.forEach(label => {
            const listItem = document.createElement('li');
            
            // Konfidenzwert aus dem Decimal-String konvertieren und formatieren
            // Die Konfidenz kommt als String vom Backend (wegen Decimal-Typ)
            const confidence = parseFloat(label.Confidence).toFixed(2); 
            
            listItem.textContent = `‣ ${label.Name}: ${confidence}%`;
            labelsList.appendChild(listItem);
        });
    } else {
        labelsList.innerHTML = '<li>Keine prominenten Labels gefunden (Min. Konfidenz 70%).</li>';
    }
}


// =================================================================
// 5. BILDANALYSE-LOGIK: Der alte Code, angepasst für Overlays
// =================================================================
async function analyzeImage(imageKey) {
    // 0. UI Vorbereitung und Bildquelle setzen
    imageContainer.querySelectorAll('.overlay-box').forEach(box => box.remove());
    imgElement.src = S3_BASE_URL + imageKey;

    // 1. API-Abruf
    const response = await fetch(API_URL + imageKey);
    
    if (!response.ok) {
        throw new Error(`API-Abruf fehlgeschlagen (${response.status}): ${response.statusText}`);
    }
    
    // 2. JSON-Parsing
    const resultData = await response.json(); 
    
    if (!resultData.Labels || !Array.isArray(resultData.Labels)) {
        throw new Error("Analyse-Daten unvollständig oder fehlerhaft.");
    }
    
    // 3. Strukturierte Datenanzeige (NEUE LOGIK)
    displayAnalysisData(resultData, imageKey);

    // 4. Warten, bis das Bild geladen ist, um Pixelmaße zu erhalten
    return new Promise(resolve => {
        imgElement.onload = () => {
            const imageWidth = imgElement.clientWidth;
            const imageHeight = imgElement.clientHeight;

            resultData.Labels.forEach(label => {
                if (label.Instances && label.Instances.length > 0) {
                    label.Instances.forEach(instance => {
                        const box = instance.BoundingBox || instance; 
                        
                        // Umrechnung in Pixel
                        const x = box.Left * imageWidth;
                        const y = box.Top * imageHeight;
                        const w = box.Width * imageWidth;
                        const h = box.Height * imageHeight;

                        // 1. Erstelle und positioniere das Overlay (Die transparente Box)
                        const overlay = document.createElement('div');
                        overlay.className = 'overlay-box';
                        overlay.style.left = `${x}px`;
                        overlay.style.top = `${y}px`;
                        overlay.style.width = `${w}px`;
                        overlay.style.height = `${h}px`;
                        
                        // 2. Erstelle und positioniere den Label-Text (Der Text mit schwarzem Hintergrund)
                        const labelText = document.createElement('div');
                        labelText.className = 'overlay-label';
                        labelText.textContent = label.Name; // <<< Jetzt wird der Name zugewiesen
                        
                        // 3. Füge BEIDE Elemente dem Container hinzu
                        imageContainer.appendChild(overlay);
                        imageContainer.appendChild(labelText);
                        
                        // 4. Positioniere den Text kurz über der Box
                        labelText.style.left = `${x}px`;
                        // -20px ist der Abstand nach oben, wie in styles.css definiert
                        labelText.style.top = `${y - 20}px`;  
                    });
                }
            });
            resolve();
        };
        
        // Fallback für gecachte Bilder
        if (imgElement.complete && imgElement.naturalHeight !== 0) {
             imgElement.onload();
             resolve();
        }
    });
}

// Initialer Status beim Laden der Seite
setStatus(false, 'Bereit.');