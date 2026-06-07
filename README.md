# Leakdownload

Leakdownload là một trình quản lý tải xuống đa năng hỗ trợ tải file thông thường (HTTP) và Torrent, được xây dựng bằng Go và Wails. Dự án tập trung vào tính hiệu quả, ổn định và sử dụng tài nguyên hệ thống ở mức thấp.

## Tính năng

*   **Tải Torrent**: Hỗ trợ Magnet Link và `.torrent` files với tốc độ cao, hỗ trợ DHT và tracker tùy chỉnh.
*   **Tải HTTP**: Bắt link trực tiếp và tải xuống.
*   **Tích hợp Clipboard**: Tự động nhận diện và bắt link `.torrent` từ clipboard.
*   **Tiện ích mở rộng Chrome**: Bắt link trực tiếp thông qua Catch Server local tại cổng `19876`.
*   **Tùy biến tốc độ**: Giới hạn tốc độ tải xuống/tải lên.
*   **Quản lý tệp**: Đặt độ ưu tiên cho các tệp trong một torrent, tạm dừng, tiếp tục.

## Yêu cầu

*   [Go](https://golang.org/doc/install) 1.22 trở lên.
*   [Node.js](https://nodejs.org/en/download/) (Yêu cầu để build frontend)
*   [Wails](https://wails.io/docs/gettingstarted/installation) CLI để quản lý quá trình build.

## Chạy dưới chế độ Dev (Development)

Trong môi trường development, bạn có thể sử dụng Wails CLI để khởi chạy ứng dụng với chế độ Live Reloading.

```bash
wails dev
```

(Lưu ý: Nếu bạn chạy trên Linux/macOS, có thể bạn sẽ cần cài đặt thêm các thư viện đồ họa hệ thống như `webkit2gtk-4.0`, `gtk3` được yêu cầu bởi Wails).

## Cách build ứng dụng cho Windows

Leakdownload được cấu hình để biên dịch và chạy tốt trên Windows.

Nếu bạn đang ở trên một môi trường Windows, chỉ cần chạy lệnh sau:

```bash
wails build -platform windows/amd64
```

Nếu bạn đang ở trên Linux hoặc macOS, wails có hỗ trợ cross-compilation (tạo file `.exe` từ Linux/macOS):

```bash
wails build -platform windows/amd64
```
Lưu ý: Các file thực thi sau khi build sẽ được tạo ra tại thư mục `build/bin/`.
