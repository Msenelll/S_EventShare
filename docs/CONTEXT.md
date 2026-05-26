# Teknik Bağlam ve Mimari Kararlar (CONTEXT.md)

Bu doküman, **S_EventShare** projesinin teknik kararlarını, mimari tercihlerini ve genel yapısını belgelemek amacıyla oluşturulmuştur.

---

## 🎯 Projenin Amacı (Goal)

Kullanıcıların QR kod aracılığıyla erişebileceği, ek bir kimlik doğrulama adımı (OAuth) gerektirmeden sadece Ad ve Soyad girerek 510MB boyutuna kadar olan görsel ve video dosyalarını doğrudan, güvenli bir şekilde geliştiricinin Google Drive klasörüne yükleyebileceği ve işlemlerin günlük kaydını (audit logs) Google Sheets tablosuna ekleyebileceği bir sistem tasarlamaktır.

---

## 🏗️ Mimari Kararlar ve Teknik Tercihler

### 1. Parçalı ve Kesintiden Devam Edebilir Yükleme Protokolü (Resumable Upload)
*   **Sorun:** Google Apps Script (GAS) isteklerinde sunucu tarafında 6 dakikalık zaman aşımı (timeout) ve maksimum 50MB gövde boyutu limiti bulunmaktadır. Ayrıca, GAS belleğinde 510MB boyutundaki bir dosyanın byte dizisini birleştirmek "Out of Memory" (Bellek Yetersiz) hatasına yol açar.
*   **Çözüm:** Google Drive'ın yerel **Resumable Upload (Kesintiden Devam Edebilir Yükleme) API'si** kullanılmıştır.
*   **İşleyiş:** 
    1. Frontend, yükleme isteğini başlattığında backend (GAS), Drive API'sine yetkili bir istek atarak yükleme oturumu açar ve geçici bir `uploadUrl` (oturum linki) alır.
    2. Backend bu linki frontend'e döner. Bu link tek başına yükleme yetkisine sahiptir, bu yüzden istemci tarafında hiçbir OAuth anahtarı veya servis hesabı sırrı barındırmaya gerek kalmaz.
    3. Frontend, dosyayı **5MB'lık** parçalara (chunk) bölerek doğrudan Google API'sine `PUT` istekleri şeklinde yükler.
    4. 5MB boyutu, Google Drive API kuralı olan **256KB'ın katı olma** zorunluluğuna tam uyar (`5 * 1024 * 1024 / 262144 = 20`).
    5. Bir parçanın yüklenmesi başarısız olursa, üstel geri çekilme (exponential backoff) algoritması devreye girerek parçayı 4 kez daha yüklemeyi dener.

### 2. CORS Ön-Uçuş (Preflight) İsteklerinin Aşılması
*   **Sorun:** Tarayıcılar, farklı bir kökene (Apps Script Web App) JSON biçimli POST istekleri gönderirken `OPTIONS` ön-uçuş isteği atar. Google Apps Script Web App altyapısı bu istekleri yerel olarak karşılamakta zorlanabilir ve CORS hatalarına yol açar.
*   **Çözüm:** İstemciden gönderilen POST istekleri `Content-Type: text/plain` üstbilgisi ile gönderilir. Tarayıcılar bu tür istekleri "basit istek" (simple request) olarak kabul ettiği için `OPTIONS` preflight isteğini atlar. GAS tarafında gelen veri JSON metni olarak çözümlenir (`JSON.parse(e.postData.contents)`).

### 3. Kullanıcı Görev Takibi ve Bağımsızlık
*   **Karar:** Geliştiricinin doğrudan müdahale edemeyeceği Google Drive Klasör ID'si, Sheets ID'si ve dağıtım adımları gibi aksiyonlar **[USER_TODO.md](file:///C:/repo/S_EventShare/docs/USER_TODO.md)** belgesinde adım adım izlenir.
*   **Aksiyon Geçmişi:** Kullanıcının tamamladığı adımlar silinmez, durumları `Done` olarak güncellenir. Böylece proje geçmişi şeffaf bir şekilde tutulur.

---

## 🏷️ Sürüm Yönetimi ve Git Akışı

*   **Versiyon Formatı:** `vA.B:C`
    *   `A`: Master (Üretim/Production) sürümü seviyesi. Yalnızca kullanıcı onayıyla `master` branch'inde güncellenir.
    *   `B`: Develop (Entegrasyon) sürümü seviyesi. Özellikler tamamlanıp `develop` branch'ine birleştirildiğinde artar.
    *   `C`: Feature (Özellik) sürümü seviyesi. Özellik branch'lerindeki bireysel commit'lerde artar.
*   **Branch Yönetimi:** Her özellik veya düzeltme için `feature/...` branch'i açılır. Geliştirici testleri tamamladıktan sonra, kullanıcı onayına ihtiyaç duymadan `develop` branch'i ile birleştirilir. `master` branch'i yalnızca en son kararlı sürümü barındırır.
