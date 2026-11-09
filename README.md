# FiiO JA11 Control (Windows)

[![Platform](https://shields.io)](https://microsoft.com)
[![Language](https://shields.io)](https://microsoft.com)

Một ứng dụng Windows gọn nhẹ giúp điều khiển và quản lý thiết bị **FiiO JA11 DAC** trực tiếp từ máy tính của bạn thông qua giao tiếp HID.

## ✨ Tính năng chính

- **Điều khiển thiết bị:** Tương tác và thay đổi các cấu hình âm thanh của FiiO JA11 DAC.
- **Quản lý Preset (LocalPresetStore):** Lưu trữ và chuyển đổi nhanh giữa các bộ thiết lập tùy chỉnh cá nhân (EQ, Bộ lọc...) ngay trên máy tính.
- **Tích hợp tài khoản FiiO (FiioAccountPanel):** Cầu nối đồng bộ (Account Bridge) giúp liên kết và quản lý thông tin cấu hình tài khoản cá nhân.
- **Chế độ khôi phục (Ja11Recovery):** Hỗ trợ xử lý, khôi phục thiết bị trong trường hợp xảy ra lỗi firmware hoặc kết nối.

## 🚀 Hướng dẫn cài đặt & Sử dụng

### Dành cho người dùng (Chạy ứng dụng)
1. Tải phiên bản mới nhất từ mục **Releases** (nếu có).
2. Giải nén và chạy file cài đặt trong thư mục `installer` hoặc chạy trực tiếp ứng dụng.

### Dành cho lập trình viên (Xây dựng từ mã nguồn)

**Yêu cầu hệ thống:**
- Windows OS
- .NET SDK (Tương thích với phiên bản chỉ định trong file `Ja11Control.csproj`)
- Visual Studio hoặc các IDE hỗ trợ C# / .NET.

**Các bước build:**
1. Clone repository về máy tính:
   ```bash
   git clone https://github.com
   cd fiio-ja11-control
   ```
2. Khôi phục các gói NuGet cần thiết:
   ```bash
   dotnet restore
   ```
3. Xây dựng ứng dụng hoặc sử dụng script đóng gói có sẵn:
   - Chi tiết cấu hình tham khảo file `BUILD.md`.
   - Hoặc chạy script PowerShell để tạo bản Release:
     ```powershell
     ./build-release.ps1
     ```

## 🛠️ Cấu trúc dự án sơ lược

- `Ja11Hid.cs`: Xử lý giao tiếp giao thức HID (Human Interface Device) với DAC.
- `MainForm.cs` & `ui/`: Giao diện người dùng trực quan của ứng dụng.
- `LocalPresetStore.cs`: Bộ lưu trữ các tùy chỉnh cấu hình EQ/âm thanh cục bộ.
- `account-bridge.js`: Thành phần cầu nối hỗ trợ các tính năng liên quan đến tài khoản FiiO dựa trên web.

## 🤝 Đóng góp phát triển (Contributing)

Mọi đóng góp giúp hoàn thiện ứng dụng đều được chào đón! Bạn có thể:
1. Fork dự án này.
2. Tạo nhánh tính năng mới (`git checkout -b feature/AmazingFeature`).
3. Commit các thay đổi của bạn (`git commit -m 'Add some AmazingFeature'`).
4. Push lên nhánh vừa tạo (`git push origin feature/AmazingFeature`).
5. Mở một **Pull Request**.

## 📄 Giấy phép (License)

Dự án này được phát hành dưới bản quyền của tác giả. Vui lòng kiểm tra kỹ hoặc bổ sung file LICENSE nếu bạn muốn chia sẻ mã nguồn mở rộng rãi.

---
*Tuyên bố miễn trừ trách nhiệm: Dự án này là một công cụ tùy biến được phát triển độc lập và không có mối liên hệ chính thức nào với thương hiệu FiiO.*
