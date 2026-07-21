<div align="center">

# leak<span style="color:#E76A2E">download</span>

### Client torrent desktop gọn nhẹ — tìm, tải, quản lý trong một app

[![Windows](https://img.shields.io/badge/Windows-10%2F11-0078D6?style=for-the-badge&logo=windows&logoColor=white)](#-tải-về-windows)
[![Go](https://img.shields.io/badge/Go-1.25+-00ADD8?style=for-the-badge&logo=go&logoColor=white)](https://go.dev/)
[![Wails](https://img.shields.io/badge/Wails-v2-red?style=for-the-badge)](https://wails.io/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Version](https://img.shields.io/badge/Version-1.1.5-E76A2E?style=for-the-badge&labelColor=1a1a1a)](#-tải-về-windows)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](./LICENSE)
[![GitHub](https://img.shields.io/badge/GitHub-leakdownload-181717?style=for-the-badge&logo=github)](https://github.com/leakdev0410/leakdownload)

<br/>

<a href="https://drive.google.com/file/d/1_qpTWYhKba_mz2Vusn-qfAxe9KR7I9s-/view?usp=drive_link">
  <img src="https://img.shields.io/badge/⬇%20Tải%20Setup%20Windows-1.1.5-E76A2E?style=for-the-badge&labelColor=1a1a1a" alt="Download Windows Setup" />
</a>

**[⬇ Tải bản cài Windows (Google Drive)](https://drive.google.com/file/d/1_qpTWYhKba_mz2Vusn-qfAxe9KR7I9s-/view?usp=drive_link)**

`leakdownload-setup-1.1.5.exe` · Windows 10/11 (x64) · ~7 MB

**Mã nguồn:** [github.com/leakdev0410/leakdownload](https://github.com/leakdev0410/leakdownload)

</div>

---

## ✨ Tính năng (v1.1.5)

| | |
|:---:|:---|
| 🧲 | **Thêm torrent** — magnet, file `.torrent`, kéo-thả; tùy chọn bắt đầu ngay / bỏ kiểm tra hash |
| 🔍 | **Tìm kiếm trong app** — APIBay, Torrents-CSV; tùy chọn Jackett / Prowlarr |
| 🕘 | **Lịch sử tìm kiếm** — chip gần đây, tìm lại một chạm, xóa từng mục hoặc toàn bộ |
| ⏸ | **Tạm dừng / tiếp tục** — từng torrent hoặc tất cả |
| 📋 | **Hàng đợi tải** — giới hạn số torrent tải song song (0 = không giới hạn) |
| 🚫 | **Chặn seed** — mặc định chỉ tải, không upload; bật seed lại trong Cài đặt |
| 🔔 | **Thông báo khi tải xong** — toast Windows / WebView (bật/tắt trong Cài đặt) |
| 📁 | **Ưu tiên file** — cao / thường / tắt từng tệp trong torrent |
| ⚡ | **Giới hạn tốc độ** — down/up (KB/s), 0 = không giới hạn |
| 📂 | **Thư mục lưu** — chọn & mở nhanh trong Cài đặt |
| 🎨 | **Giao diện Soft Minimal** — sáng / tối, sidebar, pill UI, panel chi tiết |
| 📐 | **Bảng full-width** — cột tự căn theo cửa sổ / panel chi tiết; kéo mép cột vẫn giữ full khung |
| 📊 | **Chi tiết torrent** — files, peers, trackers, info, biểu đồ tốc độ realtime |
| 💾 | **Khôi phục phiên** — nhớ torrent, pause, ưu tiên file khi mở lại |
| 📡 | **Status bar** — tốc độ tổng, kết nối, DHT, queue, trạng thái no-seed |

### Changelog v1.1.5

- Giao diện **Soft Minimal** (typography, spacing, light/dark polish)
- Icon **Cài đặt** dạng bánh răng chuẩn
- Bảng torrent / search **luôn fit 100%** chiều ngang cửa sổ
- Panel chi tiết co giãn theo khung, giảm tràn layout
- Min window width hạ còn 960px

---

## 🖥 Tải về (Windows)

1. Mở link: **[Google Drive — Setup 1.1.5](https://drive.google.com/file/d/1_qpTWYhKba_mz2Vusn-qfAxe9KR7I9s-/view?usp=drive_link)**
2. Bấm **Tải xuống**
3. Chạy `leakdownload-setup-1.1.5.exe`
4. Chọn shortcut Desktop / Start Menu (tuỳ chọn) → **Cài đặt**
5. Mở app và bắt đầu tải

> **Yêu cầu:** Windows 10/11 64-bit, [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) (thường đã có sẵn trên Windows 11).

<details>
<summary><b>Link tải trực tiếp</b></summary>

```
https://drive.google.com/file/d/1_qpTWYhKba_mz2Vusn-qfAxe9KR7I9s-/view?usp=drive_link
```

</details>

---

## 🚀 Dùng nhanh

1. **Thêm torrent** — nút *Thêm torrent* (magnet / file) hoặc kéo thả `.torrent`
2. **Tìm online** — tab sidebar **Tìm kiếm** → gõ từ khóa → **Thêm** (double-click cũng được)
3. **Hàng đợi / seed** — Cài đặt ⚙: số tải song song, chặn seed, thông báo khi xong
4. **Chi tiết** — click một dòng để xem file, peers, trackers, chart tốc độ
5. **Lọc** — sidebar: Đang tải · Hàng đợi · Seeding · Hoàn tất · Tạm dừng

Thư mục tải mặc định:

```
%USERPROFILE%\Downloads\leakdownload
```

Cấu hình app:

```
%APPDATA%\leakdownload\config.json
```

---

## 🔌 Nguồn tìm kiếm

| Nguồn | Mặc định | Ghi chú |
|:---|:---:|:---|
| **APIBay** | Bật | API công khai |
| **Torrents-CSV** | Bật | Bổ sung / backup |
| **Jackett / Prowlarr** | Tắt | Cấu hình URL + API key trong Cài đặt |

---

## 🛠 Build từ source

### Yêu cầu

- [Go](https://go.dev/dl/) 1.25+
- [Node.js](https://nodejs.org/) 18+
- [Wails CLI](https://wails.io/docs/gettingstarted/installation)

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@latest
```

### Clone

```bash
git clone https://github.com/leakdev0410/leakdownload.git
cd leakdownload
```

### Chạy dev

```bash
wails dev
```

### Build exe Windows

```bash
wails build -platform windows/amd64
# → build/bin/leakdownload.exe
```

### Build bản Setup (Inno Setup)

```powershell
# Cần Inno Setup (hoặc tools\InnoSetup sau khi cài local)
powershell -ExecutionPolicy Bypass -File scripts\build-setup.ps1
# → build/installer/leakdownload-setup-1.1.5.exe
```

Chỉ đóng gói exe đã build sẵn:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-setup.ps1 -SkipAppBuild -Version 1.1.5
```

---

## 📁 Cấu trúc project

```
leakdownload/
├── app.go / main.go          # Wails backend bind
├── internal/
│   ├── torrentengine/        # anacrolix torrent client + queue / seed block
│   └── torrentsearch/        # multi-provider search
├── frontend/src/             # React UI (table, search, detail, settings)
├── installer/                # Inno Setup script
├── scripts/build-setup.ps1   # build app + setup
└── build/
    ├── appicon.png           # icon app
    ├── bin/                  # (gitignore) exe
    └── installer/            # (gitignore) setup
```

---

## 🧭 Tech stack

- **Backend:** Go · [anacrolix/torrent](https://github.com/anacrolix/torrent) · Wails v2  
- **Frontend:** React 19 · Vite · CSS (light/dark)  
- **Installer:** Inno Setup  

---

## 💚 Mã nguồn mở — được phép fork

**leakdownload** là phần mềm **mã nguồn mở** (open source), phát hành theo giấy phép **[MIT License](./LICENSE)**.

Repo chính: **[github.com/leakdev0410/leakdownload](https://github.com/leakdev0410/leakdownload)**

Bạn được **tự do**:

| Quyền | Ý nghĩa |
|:---|:---|
| ✅ **Dùng** | Chạy app cho mục đích cá nhân hoặc tổ chức |
| ✅ **Xem mã nguồn** | Đọc, học, kiểm tra toàn bộ source |
| ✅ **Sửa / cải tiến** | Thay đổi code theo nhu cầu |
| ✅ **Fork** | Tạo repo riêng, phát triển nhánh của bạn |
| ✅ **Chia sẻ / phân phối** | Đóng gói lại, phát hành bản fork (kể cả thương mại) |
| ✅ **Gộp lại** | Dùng code trong project khác (giữ notice MIT) |

> **Fork welcome.** Clone repo, bấm **Fork** trên GitHub, sửa thoải mái.  
> Chỉ cần **giữ nguyên thông báo bản quyền + file `LICENSE`** khi phân phối lại (điều kiện MIT).

Chi tiết pháp lý đầy đủ: xem file **[LICENSE](./LICENSE)**.

---

## ⚠️ Tuyên bố miễn trừ trách nhiệm (Disclaimer)

**ĐỌC KỸ TRƯỚC KHI TẢI, CÀI ĐẶT VÀ SỬ DỤNG.**

### 1. Công cụ kỹ thuật, không phải kho nội dung

- Ứng dụng này chỉ là **phần mềm client BitTorrent** + tính năng tìm metadata/magnet từ nguồn công khai hoặc indexer do **bạn** cấu hình.  
- Dự án **không** lưu trữ, cung cấp, khuyến khích hay bảo đảm bất kỳ file torrent, media, phần mềm lậu, hay nội dung có bản quyền nào.

### 2. Người dùng tự chịu trách nhiệm

Tác giả, contributor và người phân phối **leakdownload** **không chịu trách nhiệm** đối với:

| Hạng mục | Ví dụ |
|:---|:---|
| **Nội dung người dùng tải** | Phim, nhạc, game, phần mềm, tài liệu… qua magnet/torrent |
| **Hành vi sử dụng app** | Chia sẻ, seed, tìm kiếm, cấu hình indexer |
| **Hậu quả pháp lý** | Vi phạm bản quyền, luật sở hữu trí tuệ, quy định địa phương |
| **Thiệt hại hệ thống** | Mất dữ liệu, malware từ file người dùng tự chọn tải, xung đột phần mềm |
| **Mạng / bảo mật** | ISP, firewall, VPN, rò rỉ IP, tấn công từ peer |
| **Bản build / fork của bên thứ ba** | File setup trên Drive, mirror, bản fork không chính thức |
| **Gián đoạn dịch vụ** | API search chết, tracker fail, WebView2 thiếu |

**Bạn** (người tải về, cài đặt và sử dụng) hoàn toàn chịu trách nhiệm:

1. Chỉ tải và chia sẻ nội dung **bạn có quyền hợp pháp**.  
2. Tuân thủ luật pháp tại quốc gia / khu vực của bạn.  
3. Tự rà soát file trước khi mở/cài từ nguồn torrent.  
4. Tự đánh giá rủi ro khi bật search, Jackett, Prowlarr, v.v.

### 3. Phần mềm “AS IS” — không bảo hành

Phần mềm được cung cấp **nguyên trạng (AS IS)**, **không bảo hành** mọi hình thức — kể cả tính thương mại, phù hợp mục đích, hay không xâm phạm.  
Trong phạm vi pháp luật cho phép, **không ai** trong dự án chịu trách nhiệm về thiệt hại trực tiếp/gián tiếp phát sinh từ việc tải, cài, dùng, hay không dùng được phần mềm.

### 4. Bằng việc tải / cài / chạy app

Bạn xác nhận đã đọc và **đồng ý** với tuyên bố này và với **[MIT License](./LICENSE)**.  
Nếu **không đồng ý**, hãy **không tải, không cài và không sử dụng** phần mềm.

---

## 📄 License

```
MIT License — Copyright (c) 2026 leakdownload contributors
```

- Giấy phép đầy đủ: **[LICENSE](./LICENSE)**  
- Tóm tắt: [ChooseALicense — MIT](https://choosealicense.com/licenses/mit/)  
- Badge: [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

---

<div align="center">

**Open source · Free to fork · Use at your own risk**

**Made with ☕ · Go + Wails + React · v1.1.5**

[⬇ Tải Setup Windows](https://drive.google.com/file/d/1_qpTWYhKba_mz2Vusn-qfAxe9KR7I9s-/view?usp=drive_link)
&nbsp;·&nbsp;
[GitHub](https://github.com/leakdev0410/leakdownload)
&nbsp;·&nbsp;
[LICENSE](./LICENSE)
&nbsp;·&nbsp;
[Issues](https://github.com/leakdev0410/leakdownload/issues)

</div>
