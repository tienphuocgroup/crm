# CRM cho doanh nghiệp Việt Nam: hiểu đúng, dùng được, và giữ dữ liệu của chính mình

## 1. CRM là gì, nói cho dễ hiểu

Mỗi công ty đều đã có một CRM rồi — chỉ là nó nằm rải rác: cuốn sổ tay của anh trưởng phòng kinh doanh, file Excel "danh sách khách 2024" trên máy chị kế toán, nhóm Zalo với khách, và hộp thư của từng nhân viên.

**CRM (Quản lý Quan hệ Khách hàng)** chỉ làm một việc: gom tất cả những thứ đó vào *một chỗ chung*, để khi một người nghỉ việc thì quan hệ khách hàng vẫn ở lại công ty.

Hãy hình dung như cuốn **sổ cái** của kế toán. Không ai hỏi "sổ cái để làm gì" — vì ai cũng hiểu rằng tiền vào tiền ra phải ghi một chỗ, ghi theo quy tắc, ai cũng đọc được. CRM là sổ cái của phần *khách hàng*: ai đã nói chuyện với ai, đã hứa gì, hợp đồng đang ở bước nào, và lần liên hệ tiếp theo là khi nào.

Ba loại thông tin cốt lõi:

| Khái niệm | Tiếng Việt | Là gì |
| --- | --- | --- |
| **Company** | Công ty khách hàng | Pháp nhân quý vị bán hàng cho |
| **Contact** | Người liên hệ | Con người cụ thể: anh Minh mua hàng, chị Lan kế toán |
| **Deal** | Cơ hội bán hàng | Một thương vụ đang chạy, có giá trị và có giai đoạn |

Gắn quanh ba thứ đó là **hoạt động** (Activity): ghi chú, cuộc gọi, cuộc họp, việc cần làm, và email. Đó là dòng thời gian của mối quan hệ.

## 2. Vì sao doanh nghiệp Việt cần

| Vấn đề quen thuộc | CRM giải quyết thế nào |
| --- | --- |
| Nhân viên kinh doanh nghỉ việc, mang theo cả danh sách khách | Dữ liệu nằm trên hệ thống công ty, không nằm trong máy cá nhân |
| "Khách đó ai đang theo?" — hai người cùng gọi một khách | Mỗi công ty khách chỉ có một hồ sơ, thấy rõ ai phụ trách |
| Báo giá gửi rồi quên theo | Việc cần làm có hạn, hiện lên đúng ngày |
| Cuối tháng giám đốc hỏi doanh số, mất hai ngày tổng hợp Excel | Đường ống bán hàng cập nhật theo thời gian thực |
| Khách cũ hai năm không ai hỏi thăm | Lịch sử đầy đủ, biết ai lâu rồi chưa chạm tới |

Nói ngắn: CRM không làm quý vị bán được hàng. Nó làm quý vị **không đánh rơi** những đơn hàng lẽ ra đã bán được.

## 3. Bốn tình huống rất Việt Nam

**Công ty sản xuất xuất khẩu (đồ gỗ Bình Dương, dệt may, thủy sản).** Khách là buyer ở Mỹ, EU, Nhật. Một thương vụ kéo dài 6–18 tháng, đi qua hàng chục email, mẫu sản phẩm, đàm phán giá FOB. Hồ sơ công ty khách giữ toàn bộ luồng email, kèm giá trị hợp đồng bằng **USD, EUR, JPY hay CNY** — hệ thống quy đổi về một đồng tiền báo cáo với **tỷ giá được đóng băng tại thời điểm chốt**, nên quý sau xem lại con số không tự đổi.

**Chuỗi bán lẻ nhiều chi nhánh.** Khách sỉ, đại lý, khách VIP. Mỗi chi nhánh có danh sách riêng. Dùng **trường tùy chỉnh** (custom field) "Chi nhánh" để lọc, và cửa hàng trưởng thấy được khách của mình mà vẫn nằm trong một cơ sở dữ liệu chung.

**Công ty dịch vụ — agency, tư vấn, phần mềm.** Mỗi dự án là một Deal. Ghi chú cuộc họp, việc cần làm cho từng giai đoạn, và toàn bộ trao đổi email với khách nằm cùng một chỗ. Khi người phụ trách nghỉ phép, người thay chỉ cần mở hồ sơ ra đọc.

**Công ty thương mại nhỏ — vừa mua vừa bán.** Nhà cung cấp cũng là "công ty", chỉ khác cách gắn nhãn. Một chỗ để biết: nhà cung cấp nào báo giá tốt tháng này, khách nào đang chờ hàng.

## 4. Dữ liệu là của quý vị — không phải nói cho vui

Đây là điểm khác biệt lớn nhất so với các CRM thuê bao nước ngoài.

- **Mã nguồn mở, giấy phép MIT.** Quý vị tải về, tự cài trên máy chủ của mình — server đặt tại Việt Nam cũng được, VPS nước ngoài cũng được. Không ai thu phí theo đầu người dùng.
- **Cơ sở dữ liệu là PostgreSQL của quý vị.** Đây là chuẩn công nghiệp phổ biến nhất thế giới. Muốn sao lưu toàn bộ: một lệnh `pg_dump` là có file mang đi. Muốn viết báo cáo riêng: kết nối bằng SQL, không cần xin phép ai.
- **Không bị khóa chân.** Không có "gói Enterprise" để mở khóa dữ liệu của chính mình. Ngày nào quý vị muốn dừng, dữ liệu vẫn nguyên vẹn ở dạng đọc được.
- **Đọc email là chỉ-đọc, và chỉ từ lúc kết nối trở đi.** Quyền xin từ Google/Microsoft là quyền đọc; hệ thống **không thể** gửi, trả lời, xóa hay chuyển thư. Kết nối một hộp thư mười năm tuổi cũng không kéo mười năm thư cũ vào — nó ghi mốc thời gian hiện tại rồi đi tới.
- **Thống kê ẩn danh có thể tắt.** Mỗi ngày hệ thống gửi một gói đếm ẩn danh (bao nhiêu liên hệ, theo khoảng — không tên, không email, không số tiền, không cả địa chỉ IP). Đặt `CRM_TELEMETRY_DISABLED=1` là tắt hẳn.

**Nói thật một điều:** nếu quý vị bật trợ lý AI, phần nội dung mà nó cần đọc sẽ được gửi tới nhà cung cấp mô hình ngôn ngữ ở nước ngoài để xử lý. Đó là bản chất của AI hiện nay, không riêng hệ thống này. Quý vị có ba lựa chọn thật sự: không bật agent (CRM vẫn chạy đầy đủ), bật cho một số hồ sơ, hoặc bật toàn bộ. Cơ sở dữ liệu thì luôn nằm ở chỗ quý vị trong cả ba trường hợp.

## 5. Năm cách đưa dữ liệu vào — và tình trạng thật của từng cách

| Cách | Trạng thái hôm nay | Ghi chú |
| --- | --- | --- |
| Nhập liệu thủ công | **Có sẵn** | Con đường chính |
| Nhập từ Excel/CSV | **Chưa có nút bấm** | Làm được qua cơ sở dữ liệu, cần kỹ thuật viên một lần |
| Đồng bộ email & lịch | **Có sẵn** | Gmail, Outlook, Google Calendar |
| Nối hệ thống khác (webhook) | **Chưa có sẵn** | Chưa có cổng nhận dữ liệu từ ngoài |
| Agent tự nghiên cứu | **Có sẵn** | Có bằng chứng đi kèm |

**1. Nhập liệu thủ công.** Mở màn hình, điền tên công ty, người liên hệ, giá trị thương vụ. Đây là cách nhanh nhất để bắt đầu và không nên xem thường: 50 khách hàng quan trọng nhất nhập tay trong một buổi chiều là đủ để hệ thống có ích ngay ngày hôm sau.

**2. Nhập từ Excel — xin nói thẳng.** Hệ thống **chưa có** chức năng bấm nút tải file Excel lên. Đây là hạn chế thật, và với doanh nghiệp Việt thì nó đáng kể, vì gần như ai cũng có sẵn file danh sách khách. Cách làm hiện nay: nhờ một người biết kỹ thuật nạp thẳng vào PostgreSQL (lệnh `COPY` của Postgres đọc CSV rất nhanh). Việc này làm **một lần**, mất khoảng nửa ngày cho vài nghìn dòng, và vì là mã nguồn mở nên không phụ thuộc nhà cung cấp nào. Nếu quý vị định dùng lâu dài, đây cũng là chức năng đáng đặt hàng bổ sung đầu tiên.

**3. Đồng bộ email và lịch.** Nhân viên đăng nhập bằng tài khoản Google hoặc Microsoft công ty. Từ đó, email trao đổi với khách tự động hiện trong hồ sơ khách hàng — không ai phải sao chép. Có hai lớp bảo vệ đáng chú ý: hệ thống chỉ tạo hồ sơ mới khi **quý vị đã trả lời** người đó (nhận thư rác không tạo ra gì cả), và nó tự loại thư nội bộ, thư máy gửi (`noreply@`), cùng các tên miền email cá nhân phổ thông. Lịch Google cũng đồng bộ, tạo hoạt động "cuộc họp" — cuộc họp quý vị đã từ chối thì không tạo gì.

**4. Nối với hệ thống khác.** Hiện **chưa có** cổng webhook để form trên website hay phần mềm kế toán đẩy dữ liệu vào. Muốn có thì phải viết thêm — điều này khả thi vì mã nguồn mở, nhưng cần lập trình viên, và quý vị nên tính vào ngân sách chứ đừng coi là có sẵn.

**5. Agent tự nghiên cứu.** Đây là phần thú vị nhất, xin nói riêng ở mục dưới.

## 6. Một ngày làm việc thật sự trông như thế nào

**Nhân viên kinh doanh.** Sáng mở máy, xem danh sách việc đến hạn hôm nay — không phải nhớ trong đầu, không phải lục Zalo. Gọi ba khách, sau mỗi cuộc gọi ghi hai dòng vào hồ sơ và đặt việc tiếp theo. Chiều gửi báo giá; email tự vào hồ sơ. Kéo thương vụ từ "Đã đặt lịch demo" sang "Đã gửi hợp đồng". Hết ngày, không có gì nằm ngoài hệ thống.

**Chăm sóc khách hàng.** Khách gọi than phiền. Mở hồ sơ, thấy ngay toàn bộ lịch sử: mua gì, ai bán, đã khiếu nại lần nào chưa, email cuối cùng nói gì. Không phải hỏi khách "anh mua hàng bao giờ ạ" — câu hỏi làm khách đang bực càng bực hơn. Ghi lại vụ việc, giao việc cho người phụ trách, hẹn ngày gọi lại.

**Quản lý.** Xem đường ống bán hàng theo bảy giai đoạn cố định, từ "Đã đặt lịch demo" tới "Chốt thắng"/"Chốt thua". Thấy tổng giá trị từng giai đoạn đã quy đổi về một đồng tiền. Câu hỏi đổi từ "tháng này được bao nhiêu?" sang câu hỏi có ích hơn: "vì sao 12 thương vụ mắc kẹt ở bước gửi hợp đồng?"

## 7. Trợ lý AI: vì sao đáng có, và vì sao không phải hộp đen

Hãy nghĩ về nó như **một thư ký nghiên cứu rất chăm nhưng không tự tin thái quá**. Nó chạy theo lịch của riêng nó, kể cả khi mọi người đã tắt máy về nhà.

Nó làm được: đọc lại lịch sử email và chữ ký cuối thư để bổ sung chức danh, số điện thoại; tìm hiểu công ty khách (ngành nghề, quy mô, logo); phát hiện người liên hệ đã đổi việc; viết bản tóm tắt trước cuộc họp; tự hẹn ngày xem lại một hồ sơ và **nói rõ vì sao** sẽ quay lại sau 14 ngày.

Nguyên tắc quan trọng nhất — và là lý do nên tin nó: **không có gì được đoán.**

- Bằng chứng **mạnh** (ví dụ: chính chữ ký trong email người đó gửi) → ghi thẳng vào hồ sơ.
- Bằng chứng **yếu hơn** → không ghi, mà trở thành **đề xuất** để người thật bấm Đồng ý hoặc Bỏ qua.
- Thông tin **do người nhập thì máy không bao giờ ghi đè**.
- Mỗi thông tin đều kèm nguồn gốc và cách nó biết được.

Mỗi hồ sơ có một tab **Agent**: xem từng bước nó đã làm, những manh mối nó đã loại và vì sao. Quý vị hỏi trực tiếp nó ngay tại đó.

Một chi tiết kỹ thuật đáng để người không kỹ thuật biết: khu vực xử lý của agent **không có kết nối mạng ra ngoài và không được cầm mật khẩu cơ sở dữ liệu**. Nghĩa là không tồn tại đường nào để nội dung email khách hàng bị tuồn ra ngoài qua đó.

## 8. Lộ trình triển khai thực tế

| Giai đoạn | Thời gian | Việc cần làm |
| --- | --- | --- |
| Cài đặt | 1 ngày | Kỹ thuật viên dựng hệ thống, cấu hình đăng nhập Google/Microsoft |
| Dữ liệu nền | 3–5 ngày | Nhập 50–200 khách quan trọng nhất; nạp file Excel nếu có |
| Đội ngũ vào việc | 2 tuần | Kết nối hộp thư, thống nhất quy ước, tập thói quen ghi sau mỗi cuộc gọi |
| Bật agent | Tuần 4 | Sau khi đã có dữ liệu nền để nó có cái mà đối chiếu |
| Ổn định | 2–3 tháng | Đường ống phản ánh đúng thực tế, họp giao ban nhìn vào hệ thống |

**Ba tuần đầu là bài toán con người, không phải bài toán phần mềm.** CRM chết vì nhân viên không ghi, chứ hiếm khi chết vì lỗi kỹ thuật. Cách hiệu quả nhất: giám đốc kinh doanh chỉ duyệt những gì có trên hệ thống. Một tháng là thành nếp.

## 9. Những giới hạn xin nói trước

| Giới hạn | Ảnh hưởng |
| --- | --- |
| Giao diện hiện chỉ có tiếng Anh | Nhân viên cần vài buổi làm quen với ~30 từ khóa |
| **Chưa hỗ trợ VND** trong danh sách tiền tệ | Hợp lý cho công ty xuất khẩu (USD, EUR, JPY, CNY, SGD…); công ty bán nội địa cần bổ sung mã VND vào mã nguồn hoặc ghi bằng USD |
| Bảy giai đoạn bán hàng cố định | Chưa đổi tên hay thêm bớt giai đoạn từ giao diện |
| Chưa có nhập Excel và xuất file trực tiếp | Làm ở tầng cơ sở dữ liệu |
| Một hệ thống cho một công ty | Không quản lý nhiều pháp nhân tách biệt trên cùng bản cài |
| Cần một người biết kỹ thuật | Để cài đặt và sao lưu — không cần nuôi cả phòng IT |

## 10. Câu hỏi thường gặp

**Dữ liệu khách hàng của tôi có bị công ty nước ngoài giữ không?**  
Không. Cơ sở dữ liệu chạy trên máy chủ quý vị chọn. Chỉ khi bật trợ lý AI thì phần nội dung cần phân tích mới đi ra nhà cung cấp mô hình — và đó là lựa chọn của quý vị, tắt cũng được.

**Nếu sau này tôi muốn đổi sang phần mềm khác?**  
Sao lưu toàn bộ bằng một lệnh PostgreSQL chuẩn. Không có định dạng độc quyền, không phải xin phép ai.

**Hệ thống có tự gửi email cho khách của tôi không?**  
Không thể. Quyền được cấp là quyền đọc. Không gửi, không trả lời, không xóa, không chuyển tiếp.

**Công ty tôi 8 người, có quá nhỏ không?**  
Không. Ngưỡng hợp lý là khi có từ hai người bán hàng trở lên, hoặc khi Excel bắt đầu có nhiều phiên bản. Dưới ngưỡng đó, sổ tay vẫn ổn — và nói vậy mới thành thật.

**Chi phí thật là bao nhiêu?**  
Phần mềm miễn phí. Chi phí là máy chủ (một VPS vừa phải), công cài đặt ban đầu, và tiền dùng mô hình AI theo lượng sử dụng nếu bật agent. Không có phí theo đầu người — điểm này khác hẳn CRM thuê bao, và càng nhiều nhân viên thì khoảng cách càng lớn.

**AI có bịa thông tin về khách của tôi không?**  
Đây chính là điều hệ thống được thiết kế để chặn. Không công cụ nào được phép tự chấm điểm "tôi chắc 90%". Bằng chứng mạnh mới được ghi; yếu hơn thì thành đề xuất chờ người duyệt. Một thông tin sai mà trông có vẻ chắc chắn còn tệ hơn một ô trống, vì không ai biết đường mà sửa.

**Nhân viên có thấy được dữ liệu của nhau không?**  
Bản hiện tại: mọi người đăng nhập hợp lệ đều thấy chung dữ liệu. Việc kiểm soát nằm ở danh sách cho phép đăng nhập — thường đặt theo tên miền email công ty.

---

Nếu chỉ nhớ được một câu: **CRM tốt không phải phần mềm đẹp nhất, mà là phần mềm nhân viên chịu ghi vào mỗi ngày, và là dữ liệu quý vị vẫn cầm được trong tay sau năm năm.**
