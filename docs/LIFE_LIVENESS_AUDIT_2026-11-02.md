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

## Bổ sung: chạy tự nhiên một ngày từ bản lưu production mới nhất

Nguồn: `work/backups/pre-metro-observer-hotfix.json` (bản sao đọc từ production trước hotfix observer). Script: `work/life-day-audit-2026-11-02.mjs`; kết quả: `work/life-day-audit-2026-11-02.json`. Bốn checkpoint đầy đủ tại bước 180/360/540/720 nằm trong `work/life-day-checkpoint-2026-11-02-*.json` trên SSD. Chúng là dữ liệu kiểm thử cục bộ; không được nhập/ghi trở lại production.

Chạy 720 bước × 120 giây game, đủ **86.400 giây = một ngày game**, mất khoảng 33,92 giây trên máy trong lượt này. Không gán nhiệm vụ, không dịch chuyển cư dân, không chỉnh thời tiết/nhu cầu. Chỉ tắt đồng bộ não qua mạng để phép thử bản sao không gọi ra dịch vụ neural.

Kết quả hoạt động tự nhiên:

| Chỉ số | Thay đổi trong một ngày |
| --- | ---: |
| Chuyến metro hoàn tất | +676 |
| Lượt lên metro | +665 (một số hành khách đã ở trên tàu từ đầu ngày) |
| Chuyến taxi hoàn tất | +9 |
| Lượt tennis / trận sân vận động | +6 / +1 |
| Công trình hoàn thành | +1 |
| Giao dịch | +1.779 |
| Thu nhập lương tích lũy của nhóm sống tại mốc đo | +1.211,07 H$ |
| Cư dân đi qua ngày trả lương / hộ đi qua ngày thu phí nhà | 475 / 385 |
| Khách du lịch đến / rời thành phố | +2 / +1 |
| Cư dân sinh / tử | 0 / 1 (một người 91 tuổi, nguyên nhân đã ghi: natural causes) |
| Chuyến trực thăng / thăm bạn / chăm hộ hoàn tất | 0 / 0 / 0 trong mẫu này |

Đếm được 4.950 lần đổi loại hoạt động. Không có exception ghi log, lỗi mô phỏng mới, ID não cũ bị đổi, chỉ số vị trí/nhu cầu không hữu hạn, taxi mồ côi, chuyến taxi quá hạn, chuyến xuống trực thăng quá hạn, hoặc social/sports/civic task quá hạn tại bốn checkpoint và cuối ngày. Một ngày không phát sinh một hoạt động không chứng minh hoạt động đó đã được kiểm tra tự nhiên; trực thăng/thăm bạn/chăm hộ vẫn dựa trên các kiểm thử có tình huống đã nêu ở trên.

Các phân bố phản ánh phục hồi ở đa số dân nhưng còn ngoại lệ cần sửa:

| Nhu cầu | Đầu ngày | Cuối ngày |
| --- | ---: | ---: |
| Trung vị năng lượng | 34,07 | 52,37 |
| Cư dân năng lượng <15 | 110 | 27 |
| Trung vị đói | 44,53 | 36,46 |
| Cư dân đói >85 | 16 | 10 |
| Cư dân khát >85 | 19 | 8 |
| Cư dân sống | 598 | 597 |

**Phát hiện mới phải theo dõi:**

- FLY-01583 không đổi vị trí suốt ngày tại x=15,z=-80, action chờ đường đi, năng lượng từ 16,98 xuống 0 và đói từ 61,01 lên 100. Điểm thoát bánh xe hiện hardcode tại vị trí này nằm trong hình chữ nhật hồ chứa (tâm15,-112; kích thước58×88). Đây là trạng thái kẹt nghiêm trọng, không thể coi là đã chữa chỉ vì toàn thành phố có nhiều chuyến tàu hoàn tất. Đã chuyển root xử lý map/điểm xuống bánh xe và di trú cư dân đang kẹt.
- FLY-00287 giữ nguyên nguồn x=15,z=-6.3, action đi việc riêng bằng ô tô, routeIndex=0 dù mục tiêu đổi. Code `road-life` có thể đề xuất lại việc riêng cho người đang đi bộ, rồi khi không lập được chặng car lại nhả `roadDuty`; điều này có thể đặt lại bước đầu hành trình mỗi tick. Đã chuyển root tái hiện/sửa phần road scheduler; module của audit này không tự sửa file ngoài phạm vi.
- FLY-01036 ở nguyên khách sạn cứu trợ trong cả ngày, nhưng năng lượng tăng tới99,96 và đói còn3,19 trong khi nhà vẫn chưa an toàn. Đây là chờ nơi ở được bảo trợ có lý do, khác với hai trường hợp bị kẹt và suy kiệt ở trên.

Không dùng kết quả “không fault/NaN” để kết luận không còn lỗi đời sống: hai trường hợp mới đều có số hữu hạn và không ném exception, nhưng một ngày quan sát đã bộc lộ việc không đi tiếp được. Cần chạy lại mẫu ngày sau khi root sửa các nguyên nhân đó, giữ bản kết quả này làm đối chiếu.

### Final natural-day replay and production verification

The same immutable pre-hotfix checkpoint was replayed for all 720 two-minute steps (24 game hours), with neural synchronization disabled and no forced tasks or teleports. `work/life-day-audit-2026-11-02-final-recovery.json` records 639 completed metro trips, 661 boardings, five taxi fares, 2,059 transactions and 471 residents crossing payday. No new simulation faults, nonfinite coordinates, changed brain IDs, orphan taxi/private-flight flags or overdue social/sports/civic tasks were detected. FLY-01583 physically recovered from the legacy wet wheel exit and earned 52 work minutes; FLY-00287 resumed normal travel and meals. One stationary resident remained safely in temporary disaster shelter with full health and energy. This replay does not demonstrate every rare activity: no private flight or birth completed during this particular day.

Worker version `400eb2ac-733f-4a5d-9251-2f99fe6ffbab` was deployed with immediate Durable Object code updates. A fresh production export reports metro access version 3, all 1,609 previous resident records and unchanged brain IDs. The clock and transit counters advanced. The renderer's restored river was verified visually on the public frontend.

Directional services now remain on their own track: A always serves the forward direction and B the reverse. They operate concurrently. Each terminal unloads before a brief inactive depot turnover; passengers are never retained through the next dispatch. Access geometry has 110 physically tested up/down paths, separate ground stair footprints, and clear corner platforms.

The first optimization reduces 1,336 facade source draws to 86 spatial batches and 405 road source draws to three. It does not establish the requested 80 FPS: measured M1 Ultra samples remain variable and below that target. Chrome reports the built-in display at 60.0024 Hz. More GPU/CPU profiling is required before claiming stable Ultra performance or iPad A16 parity.

The follow-up resident upload optimization preserves every uploaded Float32 matrix value while reusing fixed poses and skipping unchanged instance slots. Three regression tests cover exact transforms, visibility/order/picking and unchanged GPU buffer versions. A local Node/Three 500-resident microbenchmark measured median moving upload CPU time 0.429→0.156 ms and stationary 0.272→0.033 ms. These are isolated CPU costs, not a whole-frame FPS measurement.
