# Kredensial Demo Aplikasi Pilah Pilih (Railway)

Gunakan daftar kredensial berikut untuk menguji coba (demo) semua *role* di aplikasi Pilah Pilih yang terhubung dengan database *staging/production* (Railway).

Semua kata sandi untuk akun dummy di bawah ini adalah: **`password123`**

## 1. Admin
| Nama | Email | Akses (Role) | Keterangan |
| :--- | :--- | :--- | :--- |
| Admin Pilah Pilih | `admin@pilahpilih.id` | Admin | Memiliki akses penuh ke dasbor admin (verifikasi pengepul/petugas, pantau transaksi). *(Catatan: Password mungkin mengikuti yang Anda buat sebelumnya (misal `admin123`), atau jika ter-reset menjadi `password123`)*. |

## 2. Pengguna Biasa (User)
| Nama | Email | Akses (Role) | Keterangan |
| :--- | :--- | :--- | :--- |
| User Aktif 1 | `user1@demo.com` | User | Akun user yang sudah melakukan *pickup* dan memiliki saldo hasil penarikan. |
| User Aktif 2 | `user2@demo.com` | User | Akun user biasa. |
| User Nonaktif | `user3@demo.com` | User | Akun user yang diset nonaktif secara sistem (bisa untuk ditest admin). |

## 3. Petugas Penjemput
| Nama | Email | Akses (Role) | Keterangan |
| :--- | :--- | :--- | :--- |
| Petugas 1 | `petugas1@demo.com` | Petugas | Petugas yang ditugaskan ke orderan dari `user1`. Coverage: Jakarta Selatan (Radius 10km). |
| Petugas 2 | `petugas2@demo.com` | Petugas | Akun petugas cadangan. |

## 4. Pengepul Sampah
| Nama | Email | Akses (Role) | Keterangan |
| :--- | :--- | :--- | :--- |
| Pengepul Verified | `pengepul1@demo.com` | Pengepul | Sudah di-verifikasi oleh admin dan bisa menerima sampah (PT Pengepul Makmur). |
| Pengepul Unverified | `pengepul2@demo.com` | Pengepul | Belum di-verifikasi oleh admin, gunakan akun ini jika ingin mendemokan fitur admin memverifikasi pengepul baru. |

---
**Catatan Penting:** 
Data ini tertanam di database **Railway**, sehingga Anda dan tim bisa memantau aliran data yang sama secara langsung kapan saja. Jaga privasi link ini jika digunakan untuk demo publik!
