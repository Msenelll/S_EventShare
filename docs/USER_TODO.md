# Kullanıcı Görev Listesi & Aksiyon Geçmişi (USER_TODO.md)

Bu dosya, projede geliştiricinin (Antigravity) tamamladığı ve sizden (Kullanıcı) beklenen aksiyonları takip etmek amacıyla oluşturulmuştur. Lütfen tamamladığınız görevlerin durumunu `[ ]` (Bekliyor) durumundan `[x]` veya `DONE` durumuna çekin. Geçmişin korunması için eski kayıtları silmeyin.

---

## 🚀 Bekleyen Kullanıcı Aksiyonları (User Pending Actions)

### 📂 Google Drive & Sheets Yapılandırması
- [x] **Görev 1: Ana Klasör Oluşturma**
  - **Açıklama:** Google Drive'ınızda tüm yüklemelerin kaydedileceği ana bir klasör oluşturun (örn: `S_EventShare_Uploads`). Bu klasörün **ID**'sini kopyalayın.
  - **Durum:** Tamamlandı (Done) - ID: `1lILYdQahFaFe2mCpWCG6QDiM3Y1ueT-W`
- [x] **Görev 2: Master Tablo (Google Sheets) Oluşturma**
  - **Açıklama:** Google Drive'ınızda günlük kayıtlarının tutulacağı yeni bir Google E-Tablo oluşturun. İlk satıra şu sütun başlıklarını ekleyin:
    - *A Sütunu:* `Tarih`
    - *B Sütunu:* `Saat`
    - *C Sütunu:* `Ad`
    - *D Sütunu:* `Soyad`
    - *E Sütunu:* `Yüklenen Belge Sayısı`
    - *F Sütunu:* `Dosya İsimleri`
    - *G Sütunu:* `Klasör Bağlantısı`
  - Bu tablonun **ID**'sini veya **URL**'sini kopyalayın.
  - **Durum:** Tamamlandı (Done) - ID: `1gELiIzCicQyrI0deVMCOVj8qsUp3aW2u6A2LnIjdsmE`

### 🌐 Google Apps Script Dağıtımı (Deployment)
- [ ] **Görev 3: Apps Script Kodunu Yapıştırma ve ID'leri Güncelleme**
  - **Açıklama:** Google Drive'da yeni bir Google Apps Script projesi oluşturun. Paylaşacağımız `Code.gs` içeriğini buraya yapıştırın. Kodun en üstündeki `PARENT_FOLDER_ID` ve `SPREADSHEET_ID` alanlarını 1. ve 2. görevde aldığınız ID'lerle güncelleyin.
  - **Durum:** Bekliyor (Todo)
- [ ] **Görev 4: Web Uygulaması (Web App) Olarak Dağıtma**
  - **Açıklama:** Apps Script editöründe sağ üstteki **Deploy (Dağıt)** > **New Deployment** seçeneğine tıklayın.
    - *Tür (Type):* Web App
    - *Execute as (Farklı çalıştır):* Me (Sizin e-posta adresiniz)
    - *Who has access (Kimin erişimi var):* Anyone (Herkes)
  - Dağıtımı tamamlayıp üretilen **Web App URL (Web Uygulaması URL'si)** bilgisini kopyalayın.
  - **Durum:** Bekliyor (Todo)

### 💻 Ön Yüz (Frontend) Bağlantısı
- [ ] **Görev 5: Frontend API Bağlantısı**
  - **Açıklama:** GitHub deponuza yükleyeceğimiz `index.html` dosyasının içerisindeki `const SCRIPT_URL = 'YOUR_APPS_SCRIPT_URL_HERE';` alanını Görev 4'te aldığınız URL ile güncelleyin.
  - **Durum:** Bekliyor (Todo)

### 📲 Yayınlama & QR Kod
- [ ] **Görev 6: GitHub Pages Aktivasyonu**
  - **Açıklama:** GitHub deponuzda (Msenelll/S_EventShare) **Settings** > **Pages** menüsüne gidin. Branch olarak `master` (veya yayınladığınız branch'i) ve `/root` klasörünü seçip kaydedin.
  - **Durum:** Bekliyor (Todo)
- [ ] **Görev 7: QR Kod Oluşturma**
  - **Açıklama:** GitHub Pages tarafından size sağlanan yayın linkini (örn: `https://msenelll.github.io/S_EventShare/`) bir QR kod üreteci aracılığıyla QR koda dönüştürün ve test edin.
  - **Durum:** Bekliyor (Todo)

---

## 🛠️ Sistem Tarafı Yapılan İşler & Sürümler (Antigravity Log)

### 📦 Sürüm: `v0.1.0` (Sprint 1 - Mimari ve Altyapı Kurulumu)
- [x] **Geliştirici Görevi 1: Mimari Planlama & Yol Haritası**
  - **Açıklama:** Sistem mimarisi belirlendi, parçalı yükleme (chunk) sınırı **10MB** olarak kararlaştırıldı.
  - **Tarih:** 26 Mayıs 2026
  - **Durum:** DONE
- [x] **Geliştirici Görevi 2: Git Deposu & Branch Yapısının Hazırlanması**
  - **Açıklama:** Depo `c:\repo\S_EventShare` dizininde ilklendirildi, `develop` ve `feature/setup` branch'leri oluşturuldu.
  - **Tarih:** 26 Mayıs 2026
  - **Durum:** DONE
