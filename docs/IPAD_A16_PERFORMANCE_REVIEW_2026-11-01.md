# Rà soát hiệu năng iPad A16 — 01/11/2026

Phạm vi: repo `fruit-fly-driving-scooter`, HEAD `64c443c`, cộng thay đổi đang làm để bỏ đèn đường động, bỏ giới hạn FPS ở mọi preset và thêm bộ đếm hiệu năng; bổ sung module batching giao thông đang tích hợp. Phần audit không đổi mã ứng dụng; sau đó đã làm riêng module traffic-signals và unit test theo phân công mới. Root tích hợp renderer chính; không deploy từ nhánh công việc này. Đã đọc cấu hình Ultra, vòng render, xe/cư dân, kiến trúc, nước/trời, cập nhật snapshot và mã Three.js đang cài. Đã chạy đếm dữ liệu bản đồ và dựng riêng các nhóm kiến trúc bằng Node/Three.js, không tạo GPU context.

**Chưa đo trên iPad A16 thật, chưa có GPU trace hoặc Safari Web Inspector trace. Các ngân sách dưới đây là mục tiêu triển khai ban đầu, không phải giới hạn phần cứng hoặc cam kết FPS.** Không có công cụ trace trình duyệt chuyên dụng trong bộ công cụ hiện tại; không lấy số FPS của Mac hay mô phỏng viewport để đại diện cho iPad.

## Kết luận thực dụng

Nên giữ toàn bộ cư dân và chi tiết Ultra, rồi giảm số lệnh vẽ, công việc ngoài khung nhìn và giật do lịch khung hình. Điểm cần xử lý đầu tiên là **6.642 mesh riêng của đèn giao thông/vạch qua đường ở Ultra**, lớn hơn nhiều so với ba nhóm vẽ thân của toàn bộ cư dân. Root đã bỏ gate giới hạn FPS theo yêu cầu mới và thêm bộ đếm; module batching giao thông bốn nhóm đang được tích hợp. Tiếp theo đo draw calls thật và chia chi tiết kiến trúc thành các cụm để culling. Không cần đổi backend hoặc giảm số não để giải quyết các vấn đề render này.

Apple công bố iPad A16 có CPU 5 lõi, GPU 4 lõi và màn hình 2360×1640. Những thông số đó không xác định FPS của cảnh WebGL; đặc biệt không nên suy từ số lõi sang một mức FPS chắc chắn. [Apple — thông số iPad A16](https://support.apple.com/en-us/122240).

## Hiện trạng đã xác minh trong mã

| Phần | Bằng chứng | Ý nghĩa |
|---|---|---|
| Renderer | `src/fulllife.ts:726–737`: WebGLRenderer, MSAA bật, highp, logarithmic depth, ACES; shadow map tắt | Chưa có shadow pass hay chuỗi hậu kỳ nặng; còn chi phí fragment và MSAA |
| Ultra cảm ứng | `src/fulllife.ts:313`: ratio 1.00, không cap FPS trong working tree (HEAD34), 650 hạt mưa, treeScale .68, windowStride 1, metroDetail 3, trafficStride 1 | Ultra trên iPad vẫn giữ cửa sổ/metro/giao thông chi tiết; độ phân giải nội bộ thấp hơn màn hình Retina |
| Nhận diện thiết bị | `src/fulllife.ts:316–320`: coarse pointer hoặc UA mobile | Không phải phát hiện năng lực GPU; iPad cùng preset chưa chứng minh cùng tốc độ |
| Cư dân | `src/instanced-residents.ts:16–20`: thorax, abdomen, wings dùng ba InstancedMesh; tư thế cố định | 500 cư dân không tương đương 500 bộ draw call. Cánh vẫn là hình tĩnh, không có hoạt ảnh vẫy |
| Xe riêng | `src/personal-cars.ts:20–24`: body/cabin/wheels instanced | Xe đang tận dụng batching; giảm xe không phải ưu tiên đầu tiên |
| Cảnh tĩnh | `src/fulllife.ts:1326`: cập nhật matrix rồi tắt matrixAutoUpdate | Đã tiết kiệm việc cập nhật transform; việc duyệt scene/culling/submission vẫn tồn tại |
| Nước | `src/city-water.ts:5–39`: phản xạ mặt trời/bầu trời bằng shader giải tích | Không có camera phản xạ hoặc render target phản xạ; giữ cách này |
| Bóng tiếp xúc | `src/city-contact-shadows.ts:4–12`: một InstancedMesh | Đã có cảm giác tiếp xúc mặt đất mà không cần shadow map |
| Đèn đường mới | `src/road-lighting.ts:5–13`: emissive vật liệu đường; canvas dataset ghi realStreetLights=0 | Không thêm PointLight cho từng cột đường. Còn một PointLight chớp sét ở `fulllife.ts:769` |
| Cập nhật server | `src/fulllife.ts:1807–1808`: snapshot mỗi 5 giây; chuyển động nội suy ở mỗi frame | Tần số gửi trạng thái không phải FPS; tăng poll để chữa giật GPU sẽ làm thêm việc CPU/network |

Three.js mô tả InstancedMesh là cách giảm draw calls khi hình học/vật liệu được dùng chung; điều này khớp với các nhóm xe và cư dân hiện có. [Three.js — InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html).

## Phát hiện ưu tiên

### P1 — Gộp đèn giao thông và vạch qua đường: module đã làm, chờ tích hợp/đo

`src/fulllife.ts:912–927` tạo mỗi giao lộ hai đầu đèn, mỗi đầu gồm cột + hộp + ba bóng: 10 mesh. Tám vạch qua đường là tám mesh nữa. `trafficStride=1` của Ultra dùng đủ 369 giao lộ trong bản đồ hiện tại.

Kết quả đếm trực tiếp bằng Node:

- 369 giao lộ × 18 = **6.642 mesh**, gồm 738 đầu đèn.
- 369 × 6 = **2.214 vật liệu bóng đèn** riêng.
- Tổng bản đồ: 413 building records, 75 road rectangles, 3.090 chỗ đỗ xe.

6.642 là số mesh được dựng, **không phải draw calls đo được trong một góc camera**: frustum culling có thể bỏ một phần. Tuy nhiên cảnh tổng quan và duyệt scene vẫn chịu chi phí nhiều đối tượng. Three.js xác nhận mỗi Mesh tạo một hoặc nhiều yêu cầu vẽ và gộp hình học giúp giảm overhead. [Three.js — Optimize Lots of Objects](https://threejs.org/manual/pages/optimize-lots-of-objects.html).

Cách sửa ít đổi hình: InstancedMesh dùng chung cho cột, hộp, bóng và vạch; đổi instanceColor của bóng theo chu kỳ NS/EW. Hai hướng vạch có thể dùng cùng box hình học qua scale/rotation. Có thể còn khoảng 4–8 nhóm vật liệu/hình học, hoặc nhiều hơn khi chia theo cụm không gian. Không bỏ giao lộ, không giảm luật đèn đỏ. Đã tạo `src/traffic-signals.ts`: bốn InstancedMesh cho cột, hộp, toàn bộ bóng dùng instanceColor và toàn bộ vạch. Bóng chỉ cập nhật màu khi chu kỳ đổi. Bốn unit test kiểm tra geometry/transform/màu/chu kỳ/stride/dispose và typecheck đã qua. Cần kiểm tra `renderer.info.render.calls` trước/sau cùng camera để định lượng mức giảm thực; chưa có phép đo iPad thật.

### P1 — Lịch khung hình: working tree đã bỏ mọi FPS cap theo yêu cầu mới

Tại thời điểm bắt đầu audit, `src/fulllife.ts:1723–1727` bỏ callback nếu chưa đủ `1000/graphics.fps`, sau đó đặt `lastRenderedAt=now`, không giữ phần thời gian dư. Với callback cách nhau 16,67 ms:

| Cap cấu hình | Khoảng đợi | Tốc độ thực lý tưởng của gate hiện tại |
|---|---:|---:|
| Mobile Ultra 34 | 29,41 ms | một frame mỗi hai callback ≈30 FPS |
| Desktop Ultra 50 | 20 ms | cũng ≈30 FPS |
| Mobile Medium 26 | 38,46 ms | một frame mỗi ba callback ≈20 FPS |

Đây là phép tính từ thuật toán, giả định lịch callback 60 Hz đều; không phải phép đo màn hình iPad. Jitter và sai số thời gian còn làm pacing lệch thêm. Root ban đầu thử cap60 và giữ dư, sau đó theo yêu cầu mới đã bỏ toàn bộ trường fps của preset và gate thời gian; rAF chạy theo nhịp trình duyệt, chỉ dừng vẽ khi document.hidden. Giữ thời gian thực cho camera/motion và đo xác nhận. Không thêm lại cap30/60 hoặc gate cũ. Dùng 60 FPS làm mốc đo độ mượt mong muốn; nếu máy thấp hơn thì tối ưu công việc render, không tự áp lại FPS cap. Cần đo p95/p99 khoảng cách frame, không chỉ FPS trung bình.

### P2 — Chia chi tiết New York thành cụm để culling, thêm LOD phần rất xa

`src/new-york-architecture.ts:10–32` gộp toàn bộ thang thoát hiểm thành một InstancedMesh và bồn nước thành một mesh. Dựng class riêng bằng Node trên bản đồ hiện tại cho kết quả:

- 50.841 instance box sắt × 12 tam giác = **610.092 tam giác**.
- 28 bồn nước × 40 = **1.120 tam giác**.
- Hai vật liệu, hai mesh.

Batching tốt cho CPU nhưng bounding sphere bao toàn thành phố không cull từng instance. Khi cụm vẫn giao camera, các chi tiết ngoài khung nhìn vẫn có thể đi vào vertex processing. Nên chia theo block/ô 80–120 đơn vị, giữ đầy đủ chi tiết ở gần; xa chỉ hiện platform/lan can chính, rồi silhouette. Ngân sách giảm tam giác phải đo theo camera, không lấy toàn bộ 611.212 tam giác làm số tiết kiệm chắc chắn.

Paris cũng đã instancing theo từng tòa: 31 tòa thuộc bộ lọc hiện tại tạo 186 mesh batches + 31 line batches, 169.224 tam giác, 14.040 instances ở stride 1. Không cần bỏ cửa sổ đẹp; có thể chia bucket vật liệu/trim trong từng cụm và vẫn giữ ID tòa nhà để ẩn khi sập. Không gộp mất khả năng đổi trạng thái từng tòa.

### P2 — Thêm đo lường nhẹ và độ phân giải thích nghi độc lập với mức chi tiết

Bản HEAD lúc đầu chưa có log/telemetry `renderer.info`; working tree của root đã thêm FPS/p95/draw calls trong Settings mỗi5giây (`src/fulllife.ts:1806–1813`). Nên mở rộng phép đo theo nhu cầu, tránh ghi DOM mỗi frame: render calls/triangles, số geometry/texture, drawing buffer, frame p50/p95/p99, thời gian cập nhật actor, render CPU submission, xử lý snapshot. `renderer.info` cung cấp các bộ đếm này nhưng không phải bộ đo byte GPU hoặc thời gian GPU. [Three.js — WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html).

Giữ lựa chọn Ultra của người dùng cho vật liệu/chi tiết, chỉ điều chỉnh drawing buffer khi quá tải kéo dài. Công thức pixel = CSS width × CSS height × renderRatio². Ví dụ **giả định** viewport 1180×820: ratio 1.00 ≈0,968 triệu pixel; .90 ≈0,784 triệu; .85 ≈0,699 triệu. .85 giảm khoảng 27,8% pixel so với 1.00, không có nghĩa FPS tăng đúng 27,8%. Viewport và DPR phải đọc từ thiết bị thật. Three.js hướng dẫn giới hạn tổng pixel nội bộ để tránh tải GPU/điện năng quá lớn. [Three.js — Responsive Design](https://threejs.org/manual/pages/responsive.html).

Dùng hysteresis: chỉ hạ sau vài giây vượt budget, nâng sau 15–30 giây ổn định; không resize canvas mỗi frame. Đừng thay cửa sổ, dân số hoặc hoạt động xã hội theo tải render. Highest không bắt buộc dựng full native 2360×1640, vì hiện mã đã dùng cap ratio 1.00.

### P2 — Kiểm tra logarithmic depth bằng phép thử riêng, tránh làm nhấp nháy trở lại

Camera đang near .08, far 7000 (`src/fulllife.ts:725`). Log depth được bật để hỗ trợ khoảng cách lớn và giảm lỗi độ sâu. Tài liệu Three.js nói cách này có thể vô hiệu tối ưu early fragment test do ghi `gl_FragDepth`; reversed depth cần extension riêng. Vì trước đây người dùng gặp nhấp nháy đồ họa, **không tắt mù quáng**. [Three.js — WebGLRenderer Options](https://threejs.org/docs/pages/WebGLRenderer.html).

Thử riêng trên thiết bị: đo log-depth hiện tại; kiểm tra hỗ trợ `EXT_clip_control` và API thực có trong phiên bản cài trước khi thử reversed depth; hoặc điều chỉnh near/far phù hợp cảnh rồi kiểm tra lại đường, cửa sổ, bậc metro và từng phòng mansion. Giữ highp. Chỉ đổi khi có ảnh so sánh và frame trace, tránh đánh đổi lỗi z-fighting lấy một số FPS chưa đo.

### P3 — Loại cấp phát nhỏ và công việc định kỳ khỏi đường input sau khi xử lý P1

- `src/personal-cars.ts:56`: mỗi frame tạo Array và object cho mọi chủ xe rồi dựng Map headway; tái sử dụng mảng/bins, chỉ cập nhật xe đang chạy. Vẫn phải giữ kiểm tra khoảng cách xe để không xuyên nhau.
- `src/fulllife.ts:1733–1741`: cập nhật cả visual ẩn; xe lại có CityMotion trong renderer xe. Có thể tái dùng pose cho marker/taxi, nhưng phải giữ follow và chọn NPC đúng.
- `src/fulllife.ts:435–437`: JSON.stringify + localStorage đồng bộ toàn snapshot; giảm tần suất cache hoặc dùng IndexedDB để tránh một nhịp giật đúng lúc poll. Đo độ dài payload/thời gian cache trước khi ưu tiên.
- `src/sports-luxury-renderer.ts:68–87`: ten-heli matrix/color bị ghi lại cả khi cả đội đỗ; chỉ cập nhật pose động hoặc khi sync đổi. Quy mô nhỏ, ưu tiên thấp hơn giao lộ.
- `src/player-controller.ts:40–50,73`: collision tòa đã có bins, nhưng mỗi substep vẫn duyệt toàn bộ mặt cầu thang/platform metro; có thể lập spatial bins tương tự. Đo riêng thời gian player.update trước khi sửa.

## Ngân sách thử nghiệm đề xuất

Đây là các ngưỡng kỹ thuật để bắt đầu A/B, không phải thông số Apple công bố:

| Hạng mục | Mục tiêu ban đầu |
|---|---|
| Cảm giác di chuyển | Không cap;60 FPS là mốc đo mong muốn, không phải giới hạn cưỡng chế |
| Frame | 60 FPS: 16,67 ms; 30 FPS: 33,33 ms; báo thêm p95/p99 và frame >50 ms |
| CPU cập nhật/render submission | p95 khoảng ≤8 ms ở chế độ 30 FPS; mục tiêu nhỏ hơn cho 60 FPS |
| GPU | Nếu timer query có sẵn và đáng tin: p95 ≤20 ms cho 30 FPS, ≤12 ms cho 60 FPS; CPU/GPU có thể chồng lấp, không cộng máy móc |
| Draw calls | Mục tiêu thử nghiệm <400 ở phố, <600 tổng quan sau batching; chỉnh theo trace thực |
| Pixel | Khởi đầu mobile Ultra hiện tại cap1.00, thêm giới hạn tổng pixel; chỉ hạ ratio khi đo thấy quá tải |
| Triangles | Theo dõi riêng phần New York 611 nghìn; LOD/culling ở xa. Bắt đầu cảnh thử khoảng ≤1 triệu tam giác hiển thị, rồi điều chỉnh từ trace |
| Dân số | Giữ toàn bộ 500+ người trong state; chỉ loại hình ngoài view/ẩn, không giảm xã hội |
| Tài nguyên | Không tăng geometry/texture liên tục sau 20 vòng mở album, chuyển camera, có cháy/xây lại |

## Kịch bản kiểm tra trên iPad thật

Chốt build/commit, iPadOS/Safari, orientation và kích thước drawing buffer. Chạy cùng save: tổng quan thành phố, đi bộ gần giao lộ đông xe, mansion từng phòng, Riverside/Paris, skyline ban đêm, hoàng hôn nhìn mặt nước, mưa giông + tối đa ba đám cháy + xe cứu hỏa. Mỗi cảnh 60–120 giây; có thêm phiên 15 phút để quan sát ổn định lâu dài. Đo riêng lúc nhận snapshot, mở bảng dân cư và album.

Có thể dùng Safari trên Mac kết nối iPad để mở Web Inspector; Timelines có Frames view cho thời gian JavaScript/layout/paint giữa các frame. Đây mới là cách kiểm tra iPad thật; simulator hay viewport emulation không thay thế GPU/điện năng/nhiệt trên máy. [WebKit — Enabling Web Inspector](https://webkit.org/web-inspector/enabling-web-inspector/), [WebKit — Timelines Tab](https://webkit.org/web-inspector/timelines-tab/).

Không khẳng định trước nhiệt độ, RAM được cấp cho tab hoặc thời lượng pin: chưa có đo thiết bị. Không quy mọi giật hình cho Safari. Mã đang có nguyên nhân cụ thể đủ để sửa và kiểm chứng trước.

## Tách rõ frontend và Worker

Đồ họa, input, camera, nước, hạt mưa, xe/cư dân chạy trên trình duyệt bằng CPU/GPU của iPad. Worker giữ thuật toán xã hội, tiền, công việc, trạng thái sự kiện và checkpoint não. `cloudflare/wrangler.jsonc:39–44` cấu hình alarm5giây và lịch neural riêng; nhịp neural không phải lịch render.

Đổi batch/LOD/pixel ratio không cần thay world data hoặc reset não. Tăng poll, giảm số não hay thay gói Worker không sửa được 6.642 mesh giao thông hoặc gate FPS của client. Khi không có người xem, Worker vẫn tiếp tục thuật toán mà không dựng hình. Cần theo dõi CPU/alarm/quota của Worker riêng, tránh dùng FPS iPad để kết luận server đủ hay thiếu tài nguyên.

## Bằng chứng có thể tái tạo

1. Import `BUILDINGS`, `ROADS`, `PARKING_SPACES`, `INTERSECTIONS` bằng Node; đếm map records và công thức tạo traffic mesh.
2. Dựng `new NewYorkArchitecture(new THREE.Group(), BUILDINGS)` trong Node; đọc count và index.count của hai nhóm, không tạo renderer.
3. Dựng `buildParisBuilding(b,1)` cho block/apartment/destination trong Riverside; cộng mesh, line, instances và triangle counts.
4. Đọc `package.json`: Three.js ^0.184.0; đối chiếu tài liệu API với mã `node_modules/three/src/renderers/WebGLRenderer.js` đang cài. Không giả định ví dụ tài liệu mới hơn tự động có ở phiên bản hiện tại.

Ưu tiên nghiên cứu tiếp: đo bản bỏ FPS cap/đèn và có bộ đếm → tích hợp traffic batching bốn nhóm đã viết → spatial chunks/LOD kiến trúc → thử iPad thật → điều chỉnh ratio chỉ khi được chấp nhận và có số đo. Không tự giảm chi tiết hay thêm lại FPS cap. Module traffic đã qua kiểm tra cấu trúc, vẫn cần ảnh so sánh từ camera thật và số đo runtime sau tích hợp. Các hướng này giữ được cảm giác thành phố phong phú trong khi giảm việc render không cần thiết.

## Kiểm chứng trong phiên làm việc

Đã chạy Chrome profile Lưu Đình Hưng trên MacBook Air M1 bằng giao diện máy thật. Đã bỏ trần FPS ở mọi preset; bộ đếm dùng các frame thực tế trong cửa sổ 5 giây. Sau batching đèn giao thông và ray metro, giới hạn khung vẽ Retina ở 2,2 triệu pixel (giữ toàn bộ geometry/material Ultra), các mẫu đi phố/bay đo được 49,2–57,8 FPS tại1932×1138. Góc toàn cảnh khi full suite mô phỏng đang chạy có mẫu35,3FPS; chưa thể kết luận mọi cảnh đạt45–60. Đây không phải thử nghiệm iPad hay phép so sánh A/B có kiểm soát. Số đo và bối cảnh lưu ở work/verification/uncapped-fps-measurements.json.
