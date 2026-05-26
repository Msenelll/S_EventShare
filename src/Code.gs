/**
 * S_EventShare - Google Apps Script Backend (Full Proxy Upload)
 * Sürüm: v0.9.0
 * Açıklama: Dosya verisi Base64 olarak Apps Script'e gönderilir,
 *            Apps Script sunucu tarafından Google Drive'a yükler.
 *            CORS sorunu tamamen ortadan kalkar (tarayıcı-Drive arası direkt iletişim YOK).
 */

// ==========================================
// ⚙️ YAPILANDIRMA (CONFIGURATION)
// ==========================================
var PARENT_FOLDER_ID = "1lILYdQahFaFe2mCpWCG6QDiM3Y1ueT-W";
var SPREADSHEET_ID   = "1gELiIzCicQyrI0deVMCOVj8qsUp3aW2u6A2LnIjdsmE";

// ==========================================
// 🌐 HTTP YÖNETİCİLERİ
// ==========================================

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "active",
    message: "S_EventShare Backend v0.9.0 aktif!",
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Tüm istekleri karşılayan ana yönlendirici.
 * action: createFolder | uploadChunk | logUpload
 */
function doPost(e) {
  var result = {};
  var requestId = Utilities.getUuid().substring(0, 8).toUpperCase();

  try {
    var data   = JSON.parse(e.postData.contents);
    var action = data.action;

    console.log("[" + requestId + "] action=" + action);

    if (action === "createFolder") {
      result = createSubmissionFolder(data.name, data.surname);

    } else if (action === "uploadChunk") {
      // Dosya parçası Base64 string olarak gelir → Drive'a PUT
      result = uploadChunkToDrive(
        data.uploadUrl,
        data.chunkBase64,
        data.start,
        data.end,
        data.totalSize
      );

    } else if (action === "initiateUpload") {
      // Geriye dönük uyumluluk: artık kullanılmıyor, uploadChunk ile değiştirildi
      result = initiateResumableUpload(data.fileName, data.fileSize, data.mimeType, data.folderId);

    } else if (action === "logUpload") {
      result = logUploadToSheet(data.name, data.surname, data.fileNames, data.folderUrl, data.documentCount);

    } else {
      result = { success: false, error: "Geçersiz action: " + action };
    }

  } catch (err) {
    console.error("[" + requestId + "] HATA: " + err.toString());
    result = { success: false, error: "Sunucu hatası: " + err.toString() };
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ==========================================
// 🛠️ CORE FUNCTIONS
// ==========================================

/**
 * Kullanıcıya özel klasör oluşturur.
 */
function createSubmissionFolder(name, surname) {
  try {
    var parentFolder = (!PARENT_FOLDER_ID || PARENT_FOLDER_ID === "YOUR_PARENT_FOLDER_ID_HERE")
      ? DriveApp.getRootFolder()
      : DriveApp.getFolderById(PARENT_FOLDER_ID);

    var timestamp    = Utilities.formatDate(new Date(), "GMT+3", "yyyyMMdd_HHmmss");
    var folderName   = timestamp + " - " + sanitizeFilename(name) + "_" + sanitizeFilename(surname);
    var newFolder    = parentFolder.createFolder(folderName);

    console.log("createFolder OK: " + folderName + " | id=" + newFolder.getId());
    return {
      success:    true,
      folderId:   newFolder.getId(),
      folderUrl:  newFolder.getUrl(),
      folderName: folderName
    };
  } catch (err) {
    console.error("createFolder HATA: " + err);
    return { success: false, error: "Klasör oluşturulamadı: " + err.toString() };
  }
}

/**
 * Google Drive Resumable Upload oturumu açar ve uploadUrl döner.
 */
function initiateResumableUpload(fileName, fileSize, mimeType, folderId) {
  try {
    var metadata = { name: fileName, parents: [folderId] };
    var options  = {
      method:      "post",
      contentType: "application/json; charset=UTF-8",
      headers: {
        "Authorization":        "Bearer " + ScriptApp.getOAuthToken(),
        "X-Upload-Content-Type": mimeType
        // X-Upload-Content-Length kasıtlı EKSİK — multi-chunk için zorunlu
      },
      payload:          JSON.stringify(metadata),
      muteHttpExceptions: true
    };

    var response   = UrlFetchApp.fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable",
      options
    );
    var statusCode = response.getResponseCode();
    var headers    = response.getHeaders();
    var uploadUrl  = headers["Location"] || headers["location"];

    console.log("initiateUpload status=" + statusCode + " | Location=" + (uploadUrl ? uploadUrl.substring(0, 60) + "..." : "YOK"));

    if ((statusCode === 200 || statusCode === 201) && uploadUrl) {
      return { success: true, uploadUrl: uploadUrl };
    }

    return {
      success: false,
      error:   "Drive oturum hatası. HTTP=" + statusCode,
      details: response.getContentText()
    };
  } catch (err) {
    console.error("initiateUpload HATA: " + err);
    return { success: false, error: err.toString() };
  }
}

/**
 * ⚡ YENİ YÖNTEM: Dosya chunk'ını Base64 olarak alır, sunucu tarafında Drive'a PUT eder.
 * Tarayıcı-Drive arası CORS sorununu tamamen ortadan kaldırır.
 *
 * @param {string} uploadUrl   - Drive resumable upload session URL
 * @param {string} chunkBase64 - Chunk verisi (Base64 encoded)
 * @param {number} start       - Chunk başlangıç byte'ı
 * @param {number} end         - Chunk bitiş byte'ı (dahil değil)
 * @param {number} totalSize   - Toplam dosya boyutu (byte)
 */
function uploadChunkToDrive(uploadUrl, chunkBase64, start, end, totalSize) {
  try {
    // Base64 string → ham byte dizisi (Blob)
    var chunkBytes = Utilities.base64Decode(chunkBase64);
    var blob       = Utilities.newBlob(chunkBytes);

    var rangeHeader  = "bytes " + start + "-" + (end - 1) + "/" + totalSize;
    var chunkLength  = end - start;

    console.log("uploadChunk | range=" + rangeHeader + " | chunkLength=" + chunkLength);

    var response   = UrlFetchApp.fetch(uploadUrl, {
      method:  "put",
      headers: {
        "Content-Range": rangeHeader
        // Content-Length KASITLI EKSİK:
        // UrlFetchApp bu başlığı "yasaklı" sayar ve manuel ayarlamaya izin vermez.
        // Payload'dan boyutu otomatik hesaplar — elle vermek Exception'a yol açar.
      },
      payload:            blob.getBytes(),
      muteHttpExceptions: true
    });

    var statusCode = response.getResponseCode();
    var body       = response.getContentText();

    console.log("uploadChunk yanıt | status=" + statusCode + " | body=" + body.substring(0, 200));

    // 308 = Resume Incomplete (daha fazla chunk bekleniyor)
    // 200 veya 201 = Yükleme tamamlandı
    if (statusCode === 308 || statusCode === 200 || statusCode === 201) {
      return { success: true, status: statusCode };
    }

    // Hata durumu — tam bilgiyi frontend'e ilet
    return {
      success:    false,
      error:      "Drive PUT hatası. HTTP " + statusCode,
      details:    body,
      rangeHeader: rangeHeader
    };

  } catch (err) {
    console.error("uploadChunk EXCEPTION: " + err);
    return { success: false, error: "uploadChunk istisnası: " + err.toString() };
  }
}

/**
 * Sheets'e yükleme kaydı ekler.
 */
function logUploadToSheet(name, surname, fileNames, folderUrl, documentCount) {
  try {
    if (!SPREADSHEET_ID || SPREADSHEET_ID === "YOUR_SPREADSHEET_ID_HERE") {
      return { success: false, error: "SPREADSHEET_ID yapılandırılmamış." };
    }

    var sheet   = SpreadsheetApp.openById(SPREADSHEET_ID).getActiveSheet();
    var now     = new Date();
    var dateStr = Utilities.formatDate(now, "GMT+3", "yyyy-MM-dd");
    var timeStr = Utilities.formatDate(now, "GMT+3", "HH:mm:ss");
    var filesStr = Array.isArray(fileNames) ? fileNames.join(", ") : fileNames;

    sheet.appendRow([dateStr, timeStr, name.trim(), surname.trim(), documentCount, filesStr, folderUrl]);

    console.log("logUpload OK");
    return { success: true };
  } catch (err) {
    console.error("logUpload HATA: " + err);
    return { success: false, error: err.toString() };
  }
}

/**
 * Dosya/klasör isimlerini temizler.
 */
function sanitizeFilename(input) {
  if (!input) return "";
  var trMap = {
    'ç':'c','Ç':'C','ğ':'g','Ğ':'G','ı':'i','I':'I','İ':'I',
    'ö':'o','Ö':'O','ş':'s','Ş':'S','ü':'u','Ü':'U'
  };
  var text = input;
  for (var c in trMap) {
    text = text.replace(new RegExp(c, 'g'), trMap[c]);
  }
  return text.replace(/[^a-zA-Z0-9_\-\s]/g, "").trim().replace(/\s+/g, "_");
}

/**
 * Manuel backend testi — Editörden çalıştırın.
 */
function testBackend() {
  console.log("=== BACKEND TESTİ BAŞLIYOR ===");

  var folderResult = createSubmissionFolder("Test", "Kullanici");
  console.log("createFolder: " + JSON.stringify(folderResult));
  if (!folderResult.success) { console.error("BAŞARISIZ"); return; }

  var uploadResult = initiateResumableUpload("test.png", 4363508, "image/png", folderResult.folderId);
  console.log("initiateUpload: " + JSON.stringify(uploadResult));
  if (!uploadResult.success) { console.error("BAŞARISIZ"); return; }

  console.log("=== TEST BAŞARILI ===");
}
