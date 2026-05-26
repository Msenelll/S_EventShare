/**
 * S_EventShare - Google Apps Script Backend (API Proxy)
 * Sürüm: v0.8.0 (Debug Logging Aktif)
 * Açıklama: Büyük dosyaların resumable (kesintiden devam edebilir) yüklenmesi için Google Drive API köprüsü
 *            ve günlük kayıtları için Google Sheets entegrasyonu.
 */

// ==========================================
// ⚙️ YAPILANDIRMA (CONFIGURATION)
// ==========================================
// Google Drive'da yüklemelerin yapılacağı ANA klasörün ID'si.
// Boş bırakılırsa kök dizine (Root Drive) yüklenir.
var PARENT_FOLDER_ID = "1lILYdQahFaFe2mCpWCG6QDiM3Y1ueT-W";

// Günlük kayıtlarının yazılacağı Google Sheet tablosunun ID'si.
var SPREADSHEET_ID = "1gELiIzCicQyrI0deVMCOVj8qsUp3aW2u6A2LnIjdsmE";

// ==========================================
// 🌐 HTTP GET & POST YÖNETİCİLERİ
// ==========================================

/**
 * Sunucu durumunu kontrol etmek için GET isteği.
 */
function doGet(e) {
  var response = {
    status: "active",
    message: "Google Apps Script Backend API aktif ve hazır!",
    timestamp: new Date().toISOString()
  };
  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * İstemciden gelen istekleri (Klasör Oluşturma, Upload Başlatma, Log Kaydı) işler.
 * CORS sorunlarını aşmak için 'text/plain' olarak gelen POST'ları destekler.
 */
function doPost(e) {
  var result = {};
  var requestId = Utilities.getUuid().substring(0, 8).toUpperCase();
  
  try {
    // Gelen ham veriyi çözümle
    var postContent = e.postData.contents;
    var data = JSON.parse(postContent);
    var action = data.action;

    console.log("[" + requestId + "] ▶ İSTEK ALINDI | action=" + action + " | zaman=" + new Date().toISOString());
    
    // Eyleme göre dallanma
    if (action === "createFolder") {
      console.log("[" + requestId + "] 📁 createFolder | name=" + data.name + " surname=" + data.surname);
      result = createSubmissionFolder(data.name, data.surname);
      console.log("[" + requestId + "] 📁 createFolder SONUÇ | success=" + result.success + " | folderId=" + result.folderId);

    } else if (action === "initiateUpload") {
      console.log("[" + requestId + "] 🔗 initiateUpload | file=" + data.fileName + " | size=" + data.fileSize + " bytes | mime=" + data.mimeType + " | folderId=" + data.folderId);
      result = initiateResumableUpload(data.fileName, data.fileSize, data.mimeType, data.folderId);
      if (result.success) {
        console.log("[" + requestId + "] ✅ initiateUpload BAŞARILI | uploadUrl=" + result.uploadUrl.substring(0, 80) + "...");
      } else {
        console.error("[" + requestId + "] ❌ initiateUpload BAŞARISIZ | error=" + result.error + " | details=" + result.details);
      }

    } else if (action === "logUpload") {
      console.log("[" + requestId + "] 📊 logUpload | name=" + data.name + " | files=" + (data.fileNames || []).join(", "));
      result = logUploadToSheet(data.name, data.surname, data.fileNames, data.folderUrl, data.documentCount);
      console.log("[" + requestId + "] 📊 logUpload SONUÇ | success=" + result.success);

    } else {
      console.warn("[" + requestId + "] ⚠️ Geçersiz action: " + action);
      result = { success: false, error: "Geçersiz eylem (Invalid action): " + action };
    }
    
  } catch (err) {
    console.error("[" + requestId + "] 💥 SUNUCU HATASI | " + err.toString() + " | stack=" + err.stack);
    result = { 
      success: false, 
      error: "Sunucu hatası: " + err.toString()
    };
  }
  
  // JSON çıktısı üret
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ==========================================
// 🛠️ YARDIMCI İŞLEVLER (CORE FUNCTIONS)
// ==========================================

/**
 * Kullanıcı adına özel dinamik yükleme klasörü oluşturur.
 * Format: [YYYYMMDD_HHMMSS] - [Ad_Soyad]
 */
function createSubmissionFolder(name, surname) {
  try {
    var parentFolder;
    
    // Ana klasör ID'si kontrolü
    if (!PARENT_FOLDER_ID || PARENT_FOLDER_ID === "YOUR_PARENT_FOLDER_ID_HERE") {
      console.log("  [createFolder] Ana klasör ID eksik, kök klasör kullanılıyor.");
      parentFolder = DriveApp.getRootFolder();
    } else {
      console.log("  [createFolder] Ana klasör açılıyor: " + PARENT_FOLDER_ID);
      parentFolder = DriveApp.getFolderById(PARENT_FOLDER_ID);
    }
    
    // Klasör ismi için zaman damgası ve ad soyad birleştirme
    var timestamp = Utilities.formatDate(new Date(), "GMT+3", "yyyyMMdd_HHmmss");
    var sanitizedName = sanitizeFilename(name);
    var sanitizedSurname = sanitizeFilename(surname);
    var folderName = timestamp + " - " + sanitizedName + "_" + sanitizedSurname;
    
    console.log("  [createFolder] Klasör oluşturuluyor: " + folderName);
    var newFolder = parentFolder.createFolder(folderName);
    
    return {
      success: true,
      folderId: newFolder.getId(),
      folderUrl: newFolder.getUrl(),
      folderName: folderName
    };
  } catch (err) {
    console.error("  [createFolder] HATA: " + err.toString());
    return { 
      success: false, 
      error: "Klasör oluşturulurken hata meydana geldi: " + err.toString() 
    };
  }
}

/**
 * Google Drive API'sinde Resumable (Kesintiden devam edebilir) yükleme oturumu başlatır.
 * İstemciye (frontend) doğrudan Google Drive'a parça yükleyebileceği geçici bir URL döner.
 *
 * KRİTİK NOT: X-Upload-Content-Length başlığı kasıtlı olarak EKSİK bırakılmıştır.
 * Bu başlık eklenirse Google Drive API'si dosyanın TEK seferde geleceğini bekler.
 * Frontend parçalı (chunked) yükleme yaptığında 2. chunk'ta API isteği reddeder.
 */
function initiateResumableUpload(fileName, fileSize, mimeType, folderId) {
  try {
    var url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable";
    
    // Google Drive'a kaydedilecek dosya bilgileri
    var metadata = {
      name: fileName,
      parents: [folderId]
    };

    console.log("  [initiateUpload] Drive API isteği hazırlanıyor...");
    console.log("  [initiateUpload] OAuth Token alınıyor...");
    var token = ScriptApp.getOAuthToken();
    console.log("  [initiateUpload] OAuth Token alındı (ilk 20 karakter): " + token.substring(0, 20) + "...");
    
    var options = {
      method: "post",
      contentType: "application/json; charset=UTF-8",
      headers: {
        "Authorization": "Bearer " + token,
        "X-Upload-Content-Type": mimeType
        // X-Upload-Content-Length KASITLI EKSİK - bkz. yukarıdaki kritik not
      },
      payload: JSON.stringify(metadata),
      muteHttpExceptions: true
    };
    
    console.log("  [initiateUpload] UrlFetchApp.fetch çağrılıyor: " + url);
    var response = UrlFetchApp.fetch(url, options);
    var statusCode = response.getResponseCode();
    var responseBody = response.getContentText();
    var responseHeaders = response.getHeaders();

    console.log("  [initiateUpload] Drive API yanıtı | HTTP Status: " + statusCode);
    console.log("  [initiateUpload] Yanıt gövdesi: " + responseBody.substring(0, 300));
    console.log("  [initiateUpload] Tüm yanıt başlıkları: " + JSON.stringify(responseHeaders));
    
    if (statusCode === 200 || statusCode === 201) {
      // Google API'si bazen case-sensitive veya case-insensitive 'Location' dönebilir
      var uploadUrl = responseHeaders["Location"] || responseHeaders["location"];
      
      if (uploadUrl) {
        console.log("  [initiateUpload] ✅ Upload URL başarıyla alındı.");
        return { 
          success: true, 
          uploadUrl: uploadUrl 
        };
      } else {
        console.error("  [initiateUpload] ❌ HTTP 200 döndü fakat 'Location' başlığı YOK! Tüm başlıklar: " + JSON.stringify(responseHeaders));
        return {
          success: false,
          error: "Drive API 200 döndü fakat Location başlığı eksik.",
          allHeaders: JSON.stringify(responseHeaders),
          body: responseBody
        };
      }
    }
    
    console.error("  [initiateUpload] ❌ Beklenmeyen HTTP Status: " + statusCode + " | Body: " + responseBody);
    return { 
      success: false, 
      error: "Google Drive oturum başlatma başarısız. HTTP Status: " + statusCode,
      details: responseBody,
      allHeaders: JSON.stringify(responseHeaders)
    };
    
  } catch (err) {
    console.error("  [initiateUpload] 💥 EXCEPTION: " + err.toString() + " | Stack: " + err.stack);
    return { 
      success: false, 
      error: "Resumable upload başlatılırken istisna: " + err.toString() 
    };
  }
}

/**
 * Yükleme tamamlandığında master Google Sheet tablosuna log kaydı ekler.
 */
function logUploadToSheet(name, surname, fileNames, folderUrl, documentCount) {
  try {
    var sheet;
    
    // Tablo ID'si kontrolü
    if (!SPREADSHEET_ID || SPREADSHEET_ID === "YOUR_SPREADSHEET_ID_HERE") {
      console.warn("  [logUpload] Tablo ID yapılandırılmamış, log atlanıyor.");
      return { 
        success: false, 
        error: "Google Sheets Tablo ID'si yapılandırılmamış!" 
      };
    }
    
    console.log("  [logUpload] Tablo açılıyor: " + SPREADSHEET_ID);
    sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getActiveSheet();
    
    // Türkiye saati ile tarih ve saat bilgileri
    var now = new Date();
    var dateStr = Utilities.formatDate(now, "GMT+3", "yyyy-MM-dd");
    var timeStr = Utilities.formatDate(now, "GMT+3", "HH:mm:ss");
    
    var filesStr = Array.isArray(fileNames) ? fileNames.join(", ") : fileNames;
    
    // Satır ekleme: Tarih, Saat, Ad, Soyad, Dosya Sayısı, Dosya İsimleri, Klasör Bağlantısı
    sheet.appendRow([
      dateStr,
      timeStr,
      name.trim(),
      surname.trim(),
      documentCount,
      filesStr,
      folderUrl
    ]);
    
    console.log("  [logUpload] ✅ Satır eklendi.");
    return { success: true };
  } catch (err) {
    console.error("  [logUpload] 💥 HATA: " + err.toString());
    return { 
      success: false, 
      error: "E-Tabloya günlük kaydı eklenirken hata: " + err.toString() 
    };
  }
}

/**
 * Dosya/Klasör isimlerini temizleme yardımcı fonksiyonu.
 */
function sanitizeFilename(input) {
  if (!input) return "";
  var trMap = {
    'ç':'c', 'Ç':'C', 'ğ':'g', 'Ğ':'G', 'ı':'i', 'I':'I', 'İ':'I',
    'ö':'o', 'Ö':'O', 'ş':'s', 'Ş':'S', 'ü':'u', 'Ü':'U'
  };
  var text = input;
  for (var c in trMap) {
    text = text.replace(new RegExp(c, 'g'), trMap[c]);
  }
  return text.replace(/[^a-zA-Z0-9_\-\s]/g, "").trim().replace(/\s+/g, "_");
}

/**
 * Manuel test fonksiyonu - Apps Script editöründe doğrudan çalıştırın.
 * Bu fonksiyon backend'in sağlıklı çalışıp çalışmadığını kontrol eder.
 */
function testBackend() {
  console.log("=== BACKEND SAĞLIK TESTİ BAŞLIYOR ===");
  
  // 1) Klasör oluşturma testi
  console.log("\n--- Test 1: createFolder ---");
  var folderResult = createSubmissionFolder("Test", "Kullanici");
  console.log("Sonuç: " + JSON.stringify(folderResult));
  
  if (!folderResult.success) {
    console.error("BAŞARISIZ: Klasör oluşturulamadı. Test durduruluyor.");
    return;
  }
  
  // 2) Resumable upload oturumu açma testi
  console.log("\n--- Test 2: initiateResumableUpload ---");
  var uploadResult = initiateResumableUpload(
    "test_file.png",
    4363508,   // 4.16MB test boyutu
    "image/png",
    folderResult.folderId
  );
  console.log("Sonuç: " + JSON.stringify(uploadResult));
  
  if (!uploadResult.success) {
    console.error("BAŞARISIZ: Upload oturumu açılamadı.");
    return;
  }
  
  console.log("\n=== TÜM TESTLER BAŞARILI ===");
  console.log("Upload URL (ilk 100 karakter): " + uploadResult.uploadUrl.substring(0, 100));
}
