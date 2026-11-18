# Warung POS PWA — Stock Opname Gudang

PWA statis berbahasa Indonesia untuk stock opname, pemindaian barcode kamera, tambah barang baru, dan pertukaran data produk melalui CSV. Seluruh antarmuka dan pustaka pemindai disertakan lokal; tidak memuat CDN saat digunakan.

## Terbitkan ke GitHub Pages

1. Buat repository GitHub baru dan unggah **seluruh isi ZIP ini** ke root repository (termasuk folder tersembunyi `.github`). Pastikan `index.html`, `manifest.webmanifest`, dan `sw.js` berada di root.
2. Pilih branch `main`, lalu push/commit.
3. Buka **Settings → Pages**. Pada **Build and deployment → Source**, pilih **GitHub Actions**.
4. Buka tab **Actions**, pastikan workflow *Deploy PWA Warung POS ke GitHub Pages* selesai dengan tanda hijau.
5. Buka URL Pages yang diberikan GitHub (umumnya `https://NAMA-AKUN.github.io/NAMA-REPO/`). Gunakan URL HTTPS tersebut untuk instalasi dan akses kamera.

Workflow `.github/workflows/pages.yml` akan menerbitkan ulang PWA setiap ada perubahan ke branch `main`. Bila mengunggah isi ZIP ke repository yang sudah memakai workflow Pages lain, sesuaikan/hapus workflow lain agar tidak saling bertabrakan.

## Pasang di perangkat

- **Windows 10/11:** buka URL HTTPS di Chrome atau Edge → ikon instalasi di bilah alamat/menu → **Instal Warung POS**. Setelah terpasang, PWA bisa dibuka dari Start Menu dan dijalankan offline setelah pemuatan pertama.
- **Android:** buka URL HTTPS di Chrome → menu ⋮ → **Instal aplikasi** / **Tambahkan ke layar utama**.
- **iPhone/iPad:** buka URL HTTPS di Safari → tombol **Bagikan** → **Tambahkan ke Layar Utama**. iOS tidak selalu menampilkan banner instalasi otomatis.
- Saat pertama membuka, muat halaman dalam keadaan online sekali agar aplikasi dan pemindai barcode tersimpan untuk pemakaian offline. Kamera memerlukan HTTPS, izin kamera, dan akses pertama; pemindaian berjalan di perangkat.
- Untuk memperbarui instalasi lama: sambungkan internet, buka PWA, tunggu service worker baru terpasang, lalu muat ulang. Jika masih menampilkan layar “Menyiapkan ruang kasir Anda…”, tutup PWA dan buka kembali; bila tetap tersangkut, hapus PWA lama dari layar utama lalu instal ulang dari URL terbaru.

## Stock opname

Masuk sebagai Admin/Super User, buka **Produk & stok → Stock opname gudang**. Gunakan **Scan kamera**, scanner barcode mode keyboard, atau impor CSV. Isi stok fisik, lalu tekan **Simpan hasil opname**. Untuk pemindahan data, ekspor CSV dari PWA dan gunakan **Impor stok / produk CSV** pada versi aplikasi desktop yang memiliki tombol impor tersebut.

CSV yang diterima menggunakan kolom seperti `nama,barcode,sku,kategori,satuan,modal,harga,stok_fisik`. Barcode atau SKU yang cocok akan memperbarui produk; baris yang tidak cocok akan dibuat sebagai produk baru. Kategori produk baru perlu merupakan kategori yang sudah ada.

## Catatan penting

- Data PWA disimpan terpisah di penyimpanan browser/perangkat ini. PWA ini **tidak menyinkronkan otomatis** ke database lokal aplikasi Windows atau perangkat lain. Gunakan CSV untuk pertukaran data dan backup.
- PWA ini adalah aplikasi web statis, bukan pengganti installer Windows. Pustaka pemindai ZXing sudah dibundel langsung ke `index.html`, sehingga tidak perlu CDN atau berkas script tambahan.
- Fitur kamera perlu browser yang menyediakan `getUserMedia`; browser meminta izin kamera. Matikan kamera setelah selesai.
- Pratinjau browser memiliki data contoh. Jangan gunakan sebagai data operasional sebelum melakukan setup dan memeriksa hasil impor.

## Berkas utama

- `index.html` — aplikasi PWA mandiri.
- `manifest.webmanifest` — metadata instalasi lintas platform.
- `sw.js` — cache shell/offline dan pembaruan versi cache.
- `icons/` — ikon Android dan Apple.
- `.github/workflows/pages.yml` — deploy otomatis ke GitHub Pages.
