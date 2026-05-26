/**
 * S_EventShare - Google Apps Script Backend (API Proxy)
 * Sürüm: v0.0.1
 * Açıklama: Büyük dosyaların resumable (kesintiden devam edebilir) yüklenmesi için Google Drive API köprüsü
 *            ve günlük kayıtları için Google Sheets entegrasyonu.
 */

// ==========================================
// ⚙️ YAPILANDIRMA (CONFIGURATION)
// ==========================================
// Google Drive'da yüklemelerin yapılacağı ANA klasörün ID'si.
// Boş bırakılırsa kök dizine (Root Drive) yüklenir.
var PARENT_FOLDER_ID = "YOUR_PARENT_FOLDER_ID_HERE";

// Günlük kayıtlarının yazılacağı Google Sheet tablosunun ID'si.
var SPREADSHEET_ID = "YOUR_SPREADSHEET_ID_HERE";

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
 * CORS sorunlarını aşmak için 'text/plain' veya 'application/json' olarak gelen POST'ları destekler.
 */
function doPost(e) {
  var result = {};
  
  try {
    // Gelen ham veriyi çözümle
    var postContent = e.postData.contents;
    var data = JSON.parse(postContent);
    var action = data.action;
    
    // Eyleme göre dallanma
    if (action === "createFolder") {
      result = createSubmissionFolder(data.name, data.surname);
    } else if (action === "initiateUpload") {
      result = initiateResumableUpload(data.fileName, data.fileSize, data.mimeType, data.folderId);
    } else if (action === "logUpload") {
      result = logUploadToSheet(data.name, data.surname, data.fileNames, data.folderUrl, data.documentCount);
    } else {
      result = { success: false, error: "Geçersiz eylem (Invalid action)" };
    }
    
  } catch (err) {
    result = { 
      success: false, 
      error: "Sunucu hatası: " + err.toString() 
    };
  }
  
  // JSON çıktısı üret ve CORS için izin ver
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
      parentFolder = DriveApp.getRootFolder();
    } else {
      parentFolder = DriveApp.getFolderById(PARENT_FOLDER_ID);
    }
    
    // Klasör ismi için zaman damgası ve ad soyad birleştirme
    var timestamp = Utilities.formatDate(new Date(), "GMT+3", "yyyyMMdd_HHmmss");
    // Türkçe karakterleri ve boşlukları temizleyerek güvenli bir klasör adı oluşturma
    var sanitizedName = sanitizeFilename(name);
    var sanitizedSurname = sanitizeFilename(surname);
    var folderName = timestamp + " - " + sanitizedName + "_" + sanitizedSurname;
    
    var newFolder = parentFolder.createFolder(folderName);
    
    // DriveApp tetiklenmesi yetkilendirme kapsamını (Scope) otomatik genişletir
    // Bu sayede getOAuthToken() gerekli izinleri alır.
    
    return {
      success: true,
      folderId: newFolder.getId(),
      folderUrl: newFolder.getUrl(),
      folderName: folderName
    };
  } catch (err) {
    return { 
      success: false, 
      error: "Klasör oluşturulurken hata meydana geldi: " + err.toString() 
    };
  }
}

/**
 * Google Drive API'sinde Resumable (Kesintiden devam edebilir) yükleme oturumu başlatır.
 * İstemciye (frontend) doğrudan Google Drive'a parça yükleyebileceği geçici bir URL döner.
 */
function initiateResumableUpload(fileName, fileSize, mimeType, folderId) {
  try {
    var url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable";
    
    // Google Drive'a kaydedilecek dosya bilgileri
    var metadata = {
      name: fileName,
      parents: [folderId]
    };
    
    var options = {
      method: "post",
      contentType: "application/json; charset=UTF-8",
      headers: {
        "Authorization": "Bearer " + ScriptApp.getOAuthToken(),
        "X-Upload-Content-Type": mimeType
        // NOT: X-Upload-Content-Length KASITLI OLARAK EKSİK BIRAKILDI.
        // Bu başlık eklenirse Google Drive API'si dosyanın tek seferde geleceğini bekler.
        // Frontend parçalı (chunked) yükleme yaptığında 2. chunk'ta API isteği reddeder.
        // Bu başlık olmadan API, parçalı (multi-chunk) yüklemeyi doğal olarak kabul eder.
      },
      payload: JSON.stringify(metadata),
      muteHttpExceptions: true
    };
    
    var response = UrlFetchApp.fetch(url, options);
    var statusCode = response.getResponseCode();
    
    if (statusCode === 200 || statusCode === 201) {
      var headers = response.getHeaders();
      // Google API'si bazen case-sensitive veya case-insensitive 'Location' dönebilir
      var uploadUrl = headers["Location"] || headers["location"];
      if (uploadUrl) {
        return { 
          success: true, 
          uploadUrl: uploadUrl 
        };
      }
    }
    
    return { 
      success: false, 
      error: "Google Drive oturum başlatma başarısız oldu. Durum Kodu: " + statusCode,
      details: response.getContentText()
    };
    
  } catch (err) {
    return { 
      success: false, 
      error: "Resumable upload başlatılırken hata: " + err.toString() 
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
      return { 
        success: false, 
        error: "Google Sheets Tablo ID'si yapılandırılmamış! Lütfen Code.gs içindeki SPREADSHEET_ID değerini girin." 
      };
    }
    
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
    
    return { success: true };
  } catch (err) {
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
