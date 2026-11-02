# Kiểm tra khả năng hoàn tất hoạt động cư dân — 02/11/2026

## Phạm vi và cách làm

Đợt này kiểm tra vòng **nhận việc → đi đến nơi → hoạt động/cập nhật nhu cầu → hoàn tất hoặc hủy → trả quyền điều khiển** của bốn module ngoài metro: `city-visitors`, `sports-luxury`, `resident-relationships`, `civic-conflict`. Bao gồm khách sạn/khách du lịch/taxi/nhiếp ảnh, trực thăng riêng/thể thao, thăm bạn/chăm người bệnh trong hộ và hội họp/xung đột dân sự.

Đây là một phần của kiểm tra toàn đời sống; không đồng nghĩa mọi hành vi thành phố đã được chứng minh đúng. Metro, map và engine nền được kiểm tra/sửa ở nhánh công việc khác. Đợt này không thêm nghề hoặc hoạt động mới, không sửa engine/map/frontend, không thay trạng thái production trực tiếp.

Phương pháp:

- Đọc các trạng thái, điều kiện nhận/nhả nhiệm vụ và cách khôi phục checkpoint.
- Dùng bản sao `work/backups/pre-society-performance-deploy.json`, không thay file nguồn hoặc gọi API ghi production.
- Tái hiện lỗi rồi thêm kiểm thử hồi quy về kết quả hữu hạn, vị trí, tiền và quyền sở hữu nhiệm vụ.
- Chạy bốn bộ kiểm thử module, gồm kiểm thử tích hợp hành trình thăm bạn qua engine thật.
- Nạp bản sao production vào engine và tiến thêm 24 bước × 120 giây game, với đồng bộ não qua mạng tắt trong phép thử này. Bản sắc/ID não được kiểm tra giữ nguyên; phép thử không tuyên bố đã chạy thêm sinh học thần kinh đầy đủ.

## Những lỗi đã tái hiện và sửa

| Lỗi | Bằng chứng trước sửa | Kết quả sửa và kiểm thử |
| --- | --- | --- |
| **Kẹt khi xuống trực thăng tại mái nhà không có địa điểm** | Bản lưu có ba chủ trực thăng ở `disembarking`: FLY-00875, FLY-00811, FLY-00684. Điểm đáp APT-14, APT-16, HOUSE-8 tồn tại trong BUILDINGS nhưng chưa có LOCATIONS. `entrance(locate(to.locationId))` ném TypeError. FLY-00875 đã quá hạn khoảng 264 nghìn giây game, năng lượng bằng 0. | Đăng ký lối vào hai đầu chuyến bay lúc đặt chuyến và khôi phục. Lối ra dùng tọa độ điểm đáp làm dự phòng nếu metadata địa điểm cũ thiếu. Cả ba actor thực tế đều hoàn tất sau một lần xử lý, trở về mặt đất y=1.1. Có test đặt chuyến → cất cánh → restore → hạ cánh → xuống thang máy → giải phóng nhiệm vụ. |
| **Máy bay thừa kế giữ chuyến bay của chủ đã mất mãi** | Chủ chết trong chuyến bay trả tiền; quyền sở hữu chuyển sang người thừa kế còn sống. Logic cũ chỉ thu hồi chuyến bay nếu chủ sở hữu hiện tại đã chết, nên không còn ai xử lý chuyến bay của chủ cũ. | Đối chiếu theo `flight.ownerId` và nhiệm vụ gắn với chuyến bay; hoàn tất chuyến đã cam kết khi đến giờ và điểm đáp an toàn. Người thừa kế giữ máy bay/ID; không giữ reservation vô hạn vì đổi chủ. |
| **Dấu hiệu taxi mồ côi chiếm toàn bộ tick cư dân** | `cityService='TAXI-OLD'` dù không còn job vẫn khiến handler trả true liên tục, ngăn đời sống bình thường tiếp tục. | Handler chỉ sở hữu cư dân khi còn job hoạt động khớp ID/vai trò. Dọn cờ mồ côi, trả quyền cho engine; không xóa hành trình cứu hộ đang sở hữu actor. |
| **Taxi ghi đè một nhiệm vụ cấp cứu mới** | Job vẫn đang chạy khi tài xế được giao xe cứu hỏa hoặc hành khách được xe cứu thương nhận. Taxi tiếp tục giữ vị trí/route; nhánh hủy cũng xóa route cấp cứu. | Taxi phát hiện nhiệm vụ xung đột và hủy/hoàn tiền đúng một lần. Giữ nguyên vị trí, hành trình, mục tiêu và action thuộc cứu hộ; không kéo người bệnh trở lại xe taxi. Test cả tài xế lẫn hành khách. |
| **Callback taxi cũ sau restore quyết toán nhầm object** | `finishTaxi(oldJobReference)` có thể sửa object trước restore, trong khi job thực trong trạng thái mới vẫn active/chưa paid; tạo nguy cơ trả lần nữa khi job mới kết thúc. | Luôn lấy job chuẩn từ trạng thái hiện tại theo ID trước quyết toán. Test callback cũ, đối chiếu job sau restore và gọi lặp: trạng thái/escrow/tổng tiền không bị quyết toán hai lần. |
| **Thăm bạn/hội họp tự hủy khi lên tàu trong chính hành trình của mình** | Cờ `onTrain` bị coi là xung đột dù cư dân đang đi đến đúng điểm hẹn của nhiệm vụ. Test giữ nhiệm vụ qua lúc lên tàu thất bại trước sửa. | Cho phép chặng tàu đã thuộc hành trình của nhiệm vụ đó; vẫn không nhận một việc mới khi đang là hành khách của hành trình khác. Test tiếp tục chặng đi → gặp/hoạt động → hoàn tất hữu hạn. Metro vẫn do engine metro điều khiển. |
| **Dọn nhiệm vụ dân sự phá route khẩn cấp** | Actor được giao nhiệm vụ cứu hộ mới nhưng civic tick/restore xóa `traveling` và route của actor trong lúc giải phóng duty cũ. | Bổ sung nhận diện nhiệm vụ khẩn cấp/ngập; chỉ giải phóng quyền của civic, giữ route của dịch vụ mới và giữ chặng tàu đang chạy. Test cả tick bình thường và khôi phục checkpoint. |
| **Thưởng thể thao cho người đã được xe cứu thương đưa đi** | Chạy lại module trước sửa: người có `ambulanceDuty`, đang đi bệnh viện, vẫn được tăng `sportsProfile.attended` và action bị đổi thành “finished a sports session”. | Phiên bị gián đoạn được hủy, nhả chỗ và roster; không cộng phần thưởng hoàn thành khi actor đã rời sân hoặc cần dịch vụ khác. Không ghi đè route/action cấp cứu. |

Ngoài ra, kiểm thử đảm bảo chuyến bay đã được tính lúc chạm đất không bị cộng lần thứ hai khi chủ chết trong lúc xuống máy bay; chuyến bay đang bay có ledger nhưng thiếu task hành khách được nối lại đúng chuyến trước khi hoàn tất. Dấu mốc hạ cánh giúp quyết toán idempotent.

## Độ bao phủ hiện tại

Kết quả lệnh:

`node --test tests-city/city-visitors.test.mjs tests-city/sports-luxury.test.mjs tests-city/resident-relationships.test.mjs tests-city/civic-conflict.test.mjs`

**55/55 ca đạt** tại thời điểm kiểm tra: khách/taxi 18; thể thao/trực thăng 18; quan hệ/chăm sóc 10; dân sự 9.

| Vòng đời | Các tình huống được kiểm tra |
| --- | --- |
| Khách du lịch/khách sạn | Đến thành phố, đặt phòng hữu hạn và thanh toán, đến khách sạn thật, nghỉ/tham quan, quay lại sân bay và rời đi; hết hạn lưu trú ưu tiên hơn taxi chưa đón; khách tử vong giải phóng phòng; khách sạn đóng và thoát vùng ngập. |
| Taxi | Tài xế tiếp cận xe, đón hành khách cùng vị trí, hành khách di chuyển cùng xe, đèn đỏ/chờ xe, thả khách và đi bộ tiếp; hủy/timeout/gián đoạn, escrow, restore giữa chuyến, callback cũ và cờ mồ côi. |
| Nhiếp ảnh/câu lạc bộ | Máy ảnh mua một lần, chỉ chụp khi sống/ngoài trời; metadata/ảnh cư dân hữu hạn; phiên chụp có giờ kết thúc. Chưa chạy render ảnh qua trình duyệt trong audit này. |
| Trực thăng riêng | Grant/thừa kế giữ ID, rooftop thật và parking di trú, đặt chuyến/cất cánh/tính phí một lần, lưu giữa chuyến, điểm đáp mất an toàn/chuyển hướng, đi xuống khỏi máy bay; chủ mất trong/sau chuyến và task hành khách thiếu. |
| Tennis/sân vận động | Đến địa điểm, giới hạn chỗ, tính phí, phiên có hạn, trận có người chơi/khán giả/điểm số và kết quả; gián đoạn cấp cứu nhả chỗ, không nhận thưởng giả. |
| Bạn bè/thăm bạn | Chỉ gặp khi có mặt ngoài trời, không đang đi/làm việc/nhiệm vụ khác; ô không gian không tạo rào cản giả; quan hệ/niềm tin thay đổi sau trải nghiệm thật; đi đến gặp bằng route engine, giữ qua chặng tàu của chính mình, ở cùng đủ thời gian, hoàn tất và restore không thưởng lại. |
| Chăm người bệnh trong hộ | Đúng hộ/đúng nhà/vị trí gần, đi về nhà và chăm theo thời gian có mặt; không chữa bệnh từ xa hoặc cho rằng cùng home label là cùng hộ; không tạo tiền, không cộng hai lần sau restore; gián đoạn và địa điểm không an toàn. |
| Hội họp/xung đột | Tập hợp thật trước khi tranh luận/tác động; hòa giải/cảnh sát phải tới nơi, giải tán hữu hạn, học/ký ức giới hạn, thương tích/trang bị có giới hạn; ảnh hưởng nhà qua urbanWorld; không cướp nhân sự thiết yếu hoặc phá nhiệm vụ cấp cứu mới. |

Các kiểm thử dùng đồng hồ game hữu hạn và kiểm tra đầu ra, quyền sở hữu nhiệm vụ và giải phóng trạng thái; không chỉ gọi một helper rồi coi như toàn vòng đã xong. Phần đi tàu trong unit test kiểm tra hợp đồng giữa module xã hội và engine: vận hành đoàn tàu/đổi tuyến/thoát ga thuộc bộ kiểm thử metro riêng.

## Thử nghiệm bản sao production

Kết quả lưu tại `work/life-liveness-production-probe-2026-11-02.json`:

- Tiến đủ **2.880 giây game qua 24 tick**, không có exception thoát ra khỏi lượt chạy.
- 576 cư dân còn sống, 15 khách tại cuối phép thử; tất cả ID não đã tồn tại trước phép thử được giữ nguyên.
- Không phát hiện `x/y/z/health/energy/hunger/thirst` không hữu hạn ở cư dân sống.
- Cả ba chủ trực thăng nêu trên đã thoát task bay. Người cạn năng lượng FLY-00875 đã chuyển sang `resting indoors`, năng lượng bắt đầu phục hồi; hai người còn lại trở về sinh hoạt trú thời tiết.
- Đo local có p50 khoảng 43 ms và p95 khoảng 236 ms/tick trong lượt chạy đồng thời với các việc kiểm tra khác. Đây không phải benchmark Cloudflare và không được dùng để hứa giới hạn tải production.

Một bản lưu production cũ chỉ chứng minh được các trạng thái chứa trong nó. Bộ test bổ sung các trạng thái gián đoạn và khôi phục mà bản lưu không tình cờ có.

## Kiểm tra engine nền được ghép trong cùng đợt

Phần công việc engine/metro do root và agent khác phụ trách, được đối chiếu với mã và test mới:

- `activeGameStepSeconds` làm các tốc độ nhu cầu cơ bản liên tục và phút làm việc phụ thuộc thời gian game thật đã trôi qua; bước chuẩn 120 giây giữ hành vi nền cũ. Test `life-clock` so cùng khoảng thời gian qua các cadence khác nhau.
- Tiền lương và phí nhà dùng mốc đồng hồ đã đi qua, thay vì đòi đúng cửa sổ phút 00–01. Test kiểm tra trả lương khi đi qua cuối ca và phí nhà khi mẫu đầu tiên sau nửa đêm trễ bảy phút; không trả hai lần và giữ cân đối tiền.
- Bảo trì hộ chạy theo mốc giờ được đi qua, tránh quét lại toàn bộ hộ cho mỗi cư dân.
- Dịch vụ và từng cư dân được cô lập lỗi, có tối đa 24 bản ghi lỗi gần đây và giới hạn tần suất log. Test `life-fault-isolation` chủ động làm getter của một quyết định cư dân ném lỗi rồi xác nhận cư dân phía sau và phần còn lại của tick vẫn tiến.
- Metro/map có bộ hồi quy riêng cho chặng tàu, lên/xuống ga và đổi tuyến. Kết quả module ngoài metro ở trên không thay cho các test đó.

`tests-city/life-clock.test.mjs` có ba ca và `tests-city/life-fault-isolation.test.mjs` có một ca đã được root chạy đạt. Các ca này nằm ngoài tổng 55 ca module nêu trên. Đây là kiểm tra liveness và nhất quán thời gian/tiền ở các nhánh đã chọn; chưa phải xác thực sinh học, hành vi xã hội hoặc mọi tốc độ học tập/phục hồi của từng hoạt động.

## Phát hiện giao cho engine nền và giới hạn còn lại

Lỗi điểm đáp không chỉ giữ một cư dân: engine trước đó có thể bị exception của một actor làm dừng phần cư dân phía sau và kinh tế, trong khi đồng hồ đã được tăng. Đã báo cho phần công việc engine; root bổ sung cô lập lỗi theo dịch vụ/cư dân và telemetry hữu hạn. Việc cô lập giúp các cư dân khác tiếp tục, còn nguyên nhân cụ thể vẫn phải sửa như lỗi điểm đáp ở trên.

Giới hạn kiểm chứng:

- Đây là kiểm tra phần ngoài metro được giao, không thay cho kiểm tra công việc, sinh sản, bệnh viện, hóa đơn, lịch ngủ và các nghề đặc biệt trong engine nền.
- Chưa chạy nhiều ngày production từ xa trong audit này; 24 tick trên bản sao là smoke test, không phải chứng minh thế giới ổn định vô hạn.
- Khi mọi điểm đáp hoặc mọi đường về sân bay thực sự không an toàn, chờ/giữ chuyến có thể là trạng thái hợp lệ. Không cho NPC dịch chuyển hoặc “hoàn tất” giả chỉ để làm đẹp số liệu. Cần phân biệt đang chờ tài nguyên có lý do với vòng lặp do lỗi.
- Không fuzz mọi dạng checkpoint hỏng tùy ý. Kiểm tra tập trung checkpoint thực, nhiệm vụ mồ côi/đổi chủ/callback cũ và các mốc đã từng gây kẹt.
- Bảo toàn ID não không đồng nghĩa neuron đã được tính thêm trong phép thử tắt neural sync; độ trễ/cadence não được kiểm tra ở luồng neural riêng.
- Chưa kiểm tra FPS, hiệu ứng hay thao tác điện thoại trong lượt audit logic này.
