# 모델별 지원 현황

`lihaohong6/BlueArchiveModels`의 모델 295개를 조사한 결과입니다. `python tools/survey_models.py docs/data/model-survey.json` → `python tools/survey_report.py docs/data/model-survey.json docs/models.md`로 다시 만들 수 있습니다.

- **지원 수준**: 전체 = 카페 동작 + 전투 자세 + 집어 들기 / 대부분 = 집어 들기만 대체 동작 / 카페 + 전투 이름 대응 필요 = 전투 동작은 있지만 이름이 달라(`Normal_Attack01_*` 등) 별칭 처리가 필요 / 카페만 = 전투 모드 없음(보조 학생 등) / 불가 = 카페 동작이 없어 펫으로 쓰기 어려움
- **자세**: N = 서서(Normal), K = 무릎(Kneel), S = 방패/엄폐(Stand)

| 지원 수준 | 모델 수 |
|---|---|
| 전체 | 168 |
| 카페만 (전투 없음) | 77 |
| 불가 (카페 동작 없음) | 32 |
| 카페 + 전투 이름 대응 필요 | 16 |
| 대부분 (집어 들기 대체) | 2 |

| 모델 | 지원 수준 | 자세 | 집어들기 | Public01 | 쓰러짐 | 후퇴 | EX | 구르기 | 동작 수 | 참고 |
|---|---|---|---|---|---|---|---|---|---|---|
| Airi (Band) | 전체 | N/K | O | O | O | O | O | - | 36 |  |
| Airi | 카페만 (전투 없음) | - | O | - | - | - | O | - | 7 |  |
| Akane (Bunny Girl) | 카페만 (전투 없음) | - | O | - | - | - | O | - | 14 |  |
| Akane (School Uniform) | 카페만 (전투 없음) | - | O | O | - | - | - | - | 8 |  |
| Akane | 전체 | N/K/S | O | O | O | O | O | O | 40 |  |
| Akari (New Year) | 카페 + 전투 이름 대응 필요 | - | O | - | - | - | - | - | 20 | 폼/특수 접두사 SM019601_; 번호 붙은 변형(SM019601_Public01) |
| Akari | 전체 | N/K/S | O | O | O | O | O | O | 42 |  |
| Ako (Dress) | 전체 | N/K | O | O | O | O | O | - | 36 |  |
| Ako | 카페만 (전투 없음) | - | O | - | - | - | O | - | 8 |  |
| Aoba | 전체 | N | O | - | O | O | O | - | 26 |  |
| Arisu (Battle) (Carrier) | 불가 (카페 동작 없음) | - | - | - | - | - | - | - | 2 |  |
| Arisu (Battle) (Scenario) | 불가 (카페 동작 없음) | N | - | - | O | - | O | - | 11 |  |
| Arisu (Battle) | 전체 | N | O | O | O | O | - | - | 33 | 번호 붙은 변형(Exs01_Cutin_01, Exs01_Cutin_02, Exs02_Cutin_01 등) |
| Arisu (Maid) | 전체 | N | O | O | O | O | O | - | 32 | 폼/특수 접두사 ST_ |
| Arisu | 전체 | N | O | O | O | O | O | - | 24 |  |
| Aru (Dress) | 전체 | N/K | O | O | O | O | O | - | 31 |  |
| Aru (New Year) | 전체 | N/K | O | O | O | O | O | - | 30 |  |
| Aru | 전체 | N/K | O | O | O | O | O | - | 33 |  |
| Asuna (Bunny Girl) | 전체 | N/K/S | O | O | O | O | O | O | 38 |  |
| Asuna (School Uniform) | 전체 | N/K | O | O | O | O | O | O | 37 |  |
| Asuna | 전체 | N/K/S | O | O | O | O | O | O | 40 |  |
| Atsuko (Swimsuit) | 카페만 (전투 없음) | - | - | - | - | - | - | - | 10 | 번호 붙은 변형(Exs01, Exs02) |
| Atsuko | 전체 | N/K | O | O | O | O | O | O | 29 |  |
| Ayane (Swimsuit) | 전체 | N | O | O | - | O | - | - | 19 |  |
| Ayane | 카페만 (전투 없음) | - | - | - | - | - | - | - | 6 |  |
| Azusa (Swimsuit) | 전체 | N/K/S | O | O | O | O | O | O | 39 |  |
| Azusa | 전체 | N/K | O | O | O | O | O | O | 40 |  |
| Cherino (Hot Spring) | 카페 + 전투 이름 대응 필요 | - | O | - | - | - | - | - | 20 | 폼/특수 접두사 Tank_; 번호 붙은 변형(Tank_Public01) |
| Cherino | 전체 | N/K/S | O | O | O | O | O | O | 44 |  |
| Chiaki | 전체 | N/K | O | - | O | O | O | O | 39 | 번호 붙은 변형(Normal_Public01) |
| Chihiro | 카페만 (전투 없음) | - | O | - | - | - | - | - | 7 |  |
| Chinatsu (Hot Spring) | 전체 | N/K | O | - | O | O | O | - | 31 |  |
| Chinatsu | 카페만 (전투 없음) | - | - | - | - | - | O | - | 8 |  |
| Chise (Swimsuit) | 전체 | N/K | O | - | O | O | O | - | 32 |  |
| Chise | 전체 | N/K | O | O | O | O | O | - | 30 |  |
| Eimi (Battle) (Carrier) | 불가 (카페 동작 없음) | - | - | - | - | - | - | - | 2 |  |
| Eimi (Battle) (Scenario) | 불가 (카페 동작 없음) | - | - | - | O | - | - | - | 5 | 번호 붙은 변형(Exs01, Exs02) |
| Eimi (Battle) | 카페 + 전투 이름 대응 필요 | - | O | O | O | O | O | - | 38 | 폼/특수 접두사 Normal01_ Normal02_; 번호 붙은 변형(Move_End_Normal02) |
| Eimi (Swimsuit) | 카페만 (전투 없음) | - | - | - | - | - | - | - | 12 |  |
| Eimi | 전체 | N/S | O | O | O | O | O | O | 33 |  |
| Eri | 전체 | N/K | O | O | O | - | O | O | 37 |  |
| Erika | 카페만 (전투 없음) | - | O | O | - | - | - | - | 9 |  |
| Fubuki (Swimsuit) | 카페만 (전투 없음) | - | - | - | - | - | O | - | 9 |  |
| Fubuki | 전체 | N/K | O | - | O | O | O | - | 30 |  |
| Fuuka (New Year) | 카페만 (전투 없음) | - | - | - | - | - | O | - | 7 |  |
| Fuuka | 카페만 (전투 없음) | - | - | - | - | - | O | - | 7 |  |
| Fuyu | 전체 | N/K | O | O | O | O | O | - | 30 |  |
| Hanae (Christmas) | 카페만 (전투 없음) | - | O | - | - | - | O | - | 8 |  |
| Hanae | 카페만 (전투 없음) | - | - | - | - | - | - | - | 11 |  |
| Hanako (Swimsuit) | 전체 | N/K | O | O | O | O | O | - | 35 |  |
| Hanako | 카페만 (전투 없음) | - | O | - | - | - | - | - | 7 |  |
| Hare (Camping) | 전체 | N/K | O | O | O | O | O | O | 33 |  |
| Hare | 카페만 (전투 없음) | - | - | - | - | - | - | - | 6 |  |
| Haruka (Dress) | 전체 | N | O | O | O | O | O | - | 28 |  |
| Haruka (New Year) | 카페만 (전투 없음) | - | O | - | - | - | O | - | 8 |  |
| Haruka | 전체 | N/S | O | O | O | O | O | O | 38 |  |
| Haruna (New Year) | 전체 | N/K | O | O | O | O | O | - | 30 |  |
| Haruna (Sportswear) | 카페만 (전투 없음) | - | O | - | - | - | - | - | 12 |  |
| Haruna | 전체 | N/K | O | O | O | O | O | - | 32 |  |
| Hasumi (Sportswear) | 전체 | N/K | O | O | O | O | O | - | 30 |  |
| Hasumi (Swimsuit) | 전체 | N/K | O | O | O | O | O | - | 33 |  |
| Hasumi | 전체 | N/K/S | O | O | O | O | O | - | 41 |  |
| Hatsune Miku | 카페만 (전투 없음) | - | - | - | - | O | O | - | 7 |  |
| Hibiki (Cheerleader) | 전체 | N | O | O | O | O | O | - | 27 |  |
| Hibiki | 카페만 (전투 없음) | - | O | - | - | - | O | - | 7 |  |
| Hifumi (Swimsuit) | 카페 + 전투 이름 대응 필요 | - | O | - | - | - | - | - | 21 | 폼/특수 접두사 Tank_; 번호 붙은 변형(Tank_Public01) |
| Hifumi | 전체 | N/K/S | O | O | O | O | O | O | 46 |  |
| Hikari | 전체 | N/K | O | O | O | O | O | O | 35 |  |
| Himari (Battle) | 카페 + 전투 이름 대응 필요 | - | O | - | - | - | - | - | 29 | 폼/특수 접두사 SM033201_ |
| Himari | 카페만 (전투 없음) | - | O | - | - | - | - | - | 7 |  |
| Hina (Dress) | 전체 | N | O | O | O | O | - | - | 43 | 번호 붙은 변형(Exs01, Exs02, Exs03 등) |
| Hina (Swimsuit) | 전체 | N | O | O | O | O | O | - | 23 |  |
| Hina | 전체 | N/S | O | O | O | O | O | - | 32 |  |
| Hinata (Swimsuit) | 카페만 (전투 없음) | - | O | - | - | - | O | - | 9 |  |
| Hinata | 전체 | N/K | O | O | O | O | O | - | 30 |  |
| Hiyori (Swimsuit) | 전체 | N/K | O | O | O | O | O | - | 33 |  |
| Hiyori | 카페만 (전투 없음) | - | - | - | - | - | O | - | 7 |  |
| Hoshino (Battle) | 불가 (카페 동작 없음) | - | - | - | - | - | - | - | 57 | 폼/특수 접두사 01_ 02_; 번호 붙은 변형(01_Exs_Cutin_01, 01_Exs_Cutin_02, 01_Normal_Attack_Ing_02 등) |
| Hoshino (Swimsuit) | 카페 + 전투 이름 대응 필요 | - | O | - | - | - | O | - | 42 | 폼/특수 접두사 Normal01_ Normal02_; 번호 붙은 변형(Normal_Idle01, Normal_Idle02, Normal01_Public01 등) |
| Hoshino | 전체 | N/S | O | O | O | O | O | O | 36 | 일부 동작에만 움직이는 무기: Hoshino_Original_Shield_Weapon |
| Ibuki | 전체 | N/K | O | O | O | O | O | - | 50 | 폼/특수 접두사 Riding; 번호 붙은 변형(RidingEx01, RidingPublic01) |
| Ichika (Swimsuit) | 카페만 (전투 없음) | - | O | - | - | - | O | - | 10 |  |
| Ichika | 전체 | N/K | O | O | O | O | O | O | 40 | 번호 붙은 변형(Exs_NP0144_01, Exs_NP0144_02, Victory_End_Random_NP0144_01 등) |
| Iori (Swimsuit) | 전체 | N/K | O | O | O | O | O | - | 31 |  |
| Iori | 전체 | N/K | O | O | O | O | O | - | 32 |  |
| Iroha | 카페 + 전투 이름 대응 필요 | - | O | - | - | - | - | - | 36 | 폼/특수 접두사 SM015601_ Tank_; 번호 붙은 변형(SM015601_RidingEx01, SM015601_RidingPublic01, Tank_Public01) |
| Izumi (New Year) | 카페만 (전투 없음) | - | O | - | - | - | - | - | 11 |  |
| Izumi (Swimsuit) | 전체 | N | O | O | O | O | O | - | 25 | 번호 붙은 변형(Normal_Reload_01) |
| Izumi | 전체 | N/S | O | O | O | O | O | - | 31 |  |
| Izuna (Swimsuit) | 전체 | N/K | O | O | O | O | O | O | 34 |  |
| Izuna | 전체 | N/K/S | O | O | O | O | O | O | 40 | 번호 붙은 변형(FX_Izuna_Original_Public01_Shuriken_01) |
| Junko (New Year) | 전체 | N/K | O | O | O | O | O | - | 30 |  |
| Junko | 전체 | N/K/S | O | O | O | O | O | O | 38 |  |
| Juri (Part-Timer) | 전체 | N | O | O | O | O | O | O | 28 |  |
| Juri | 카페만 (전투 없음) | - | - | - | - | - | - | - | 8 |  |
| Kaede | 카페만 (전투 없음) | - | - | - | - | - | - | - | 6 |  |
| Kaho | 전체 | N/K | O | O | O | O | - | O | 35 | 번호 붙은 변형(Exs_01) |
| Kanna (Swimsuit) | 전체 | N/K | O | O | O | O | O | O | 34 |  |
| Kanna | 카페만 (전투 없음) | - | O | - | - | - | O | - | 8 |  |
| Kanoe | 전체 | N | O | O | O | O | O | - | 25 |  |
| Karin (Bunny Girl) | 전체 | N/K | O | O | O | O | O | - | 31 |  |
| Karin (School Uniform) | 카페만 (전투 없음) | - | O | - | - | - | O | - | 13 |  |
| Karin | 카페만 (전투 없음) | - | O | - | - | - | O | - | 10 |  |
| Kasumi | 전체 | N/K | O | O | O | O | O | O | 36 |  |
| Kayoko (Dress) | 전체 | N/K | O | O | O | O | O | O | 32 |  |
| Kayoko (New Year) | 전체 | N/K | O | O | O | O | O | - | 33 | 번호 붙은 변형(Victory_End01, Victory_End02, Victory_Start01 등) |
| Kayoko | 전체 | N/K/S | O | O | O | O | O | O | 42 |  |
| Kazusa (Band) | 전체 | N | O | O | O | O | O | - | 28 |  |
| Kazusa | 전체 | N | O | O | O | O | O | - | 24 |  |
| Kei (Carrier 2) | 불가 (카페 동작 없음) | - | - | - | - | - | - | - | 2 |  |
| Kei (Carrier) | 불가 (카페 동작 없음) | - | - | - | - | - | - | - | 1 |  |
| Kei (Prototype) | 불가 (카페 동작 없음) | - | - | - | - | - | - | - | 0 |  |
| Kei (Scenario 1) | 불가 (카페 동작 없음) | N | - | - | - | - | - | - | 9 |  |
| Kei (Scenario 2) | 불가 (카페 동작 없음) | N | - | - | O | - | O | - | 11 |  |
| Kei | 전체 | N | O | O | O | O | O | - | 32 |  |
| Kikyou (Swimsuit) | 카페만 (전투 없음) | - | O | - | O | O | - | - | 12 |  |
| Kikyou | 전체 | N/K | O | O | O | O | O | - | 32 |  |
| Kirara | 전체 | N/K | O | O | O | O | O | O | 33 |  |
| Kirino (Swimsuit) | 카페만 (전투 없음) | - | - | - | O | - | - | - | 12 |  |
| Kirino | 전체 | N/K/S | O | O | O | O | O | O | 38 |  |
| Kisaki (Swimsuit) | 전체 | N/K | O | O | O | O | - | - | 33 | 번호 붙은 변형(Exs01, Exs02); 일부 동작에만 움직이는 무기: CH0356_Weapon_Reload |
| Kisaki | 카페만 (전투 없음) | - | O | - | - | - | - | - | 9 | 번호 붙은 변형(Exs01) |
| Koharu (Swimsuit) | 전체 | N/K | O | O | O | O | O | - | 37 |  |
| Koharu | 전체 | N/K | O | O | O | O | O | - | 32 |  |
| Kokona | 전체 | N/K | O | O | O | O | O | O | 31 |  |
| Konoka | 전체 | N | O | O | O | O | O | O | 31 |  |
| Kotama (Camping) | 전체 | N/K | O | O | O | O | O | O | 32 |  |
| Kotama | 대부분 (집어 들기 대체) | N/K/S | - | - | O | O | O | O | 40 |  |
| Kotori (Cheerleader) | 전체 | N | O | O | O | O | O | - | 24 |  |
| Kotori | 전체 | N/S | O | O | O | O | O | - | 33 | 번호 붙은 변형(Exs_02) |
| Koyuki (Pajama) | 카페만 (전투 없음) | - | O | - | - | - | O | - | 8 |  |
| Koyuki | 전체 | N | O | O | O | O | O | - | 24 | 번호 붙은 변형(Normal_Callsign1, Normal_Callsign2) |
| Kurumi | 카페 + 전투 이름 대응 필요 | - | O | O | O | O | - | - | 36 | 폼/특수 접두사 Move01_ Move02_ Normal01_ Normal02_; 번호 붙은 변형(Exs01, Vital_Death02, Vital_Dying_ing02 등) |
| Maki (Camping) | 카페만 (전투 없음) | - | O | - | - | - | O | - | 12 |  |
| Maki | 전체 | N | O | O | O | O | O | - | 26 |  |
| Makoto | 카페만 (전투 없음) | - | O | O | - | - | O | - | 10 |  |
| Mari (Idol) | 전체 | N/K | O | O | O | O | O | O | 34 |  |
| Mari (Sportswear) | 전체 | N/K | O | O | O | O | O | O | 31 | 일부 동작에만 움직이는 무기: Mari_Original_Weapon001 |
| Mari | 카페만 (전투 없음) | - | O | - | - | - | - | - | 7 |  |
| Marina (Qipao) | 전체 | N/K | O | O | O | O | O | O | 38 |  |
| Marina | 전체 | N/K/S | O | O | O | O | O | O | 41 |  |
| Mashiro (Swimsuit) | 카페만 (전투 없음) | - | O | - | - | - | - | - | 7 |  |
| Mashiro | 카페만 (전투 없음) | - | - | - | - | - | - | - | 6 |  |
| Material Development Club Member | 불가 (카페 동작 없음) | - | - | - | - | - | - | - | 1 |  |
| Megu | 전체 | N | O | O | O | O | O | - | 24 |  |
| Meru | 전체 | N/K | O | O | O | O | O | O | 34 |  |
| Michiru (Dress) | 카페만 (전투 없음) | - | O | - | - | - | O | - | 11 |  |
| Michiru | 전체 | N | O | O | O | O | O | O | 27 |  |
| Midori (Battle) | 불가 (카페 동작 없음) | - | - | - | - | - | - | - | 2 |  |
| Midori (Maid) | 전체 | N/K | O | O | O | O | O | O | 40 | 폼/특수 접두사 ST_; 번호 붙은 변형(Midori_Maid_Exs_Cutin05) |
| Midori | 전체 | N/K | O | O | O | O | O | O | 31 |  |
| Mika (Cut-in) | 불가 (카페 동작 없음) | - | - | - | - | - | - | - | 2 |  |
| Mika (Swimsuit) | 전체 | N/K | O | O | O | O | - | O | 38 | 번호 붙은 변형(Exs01, Exs02, Exs03) |
| Mika | 전체 | N/K | O | O | O | O | O | O | 33 |  |
| Mimori (Swimsuit) | 카페만 (전투 없음) | - | - | - | - | - | - | - | 10 |  |
| Mimori | 전체 | N/K/S | O | O | O | O | O | O | 38 |  |
| Mina | 전체 | N/K | O | O | O | O | O | - | 33 |  |
| Mine (Idol) | 전체 | N | O | O | O | O | O | O | 28 |  |
| Mine | 전체 | N | O | - | O | O | O | - | 25 |  |
| Minori | 카페만 (전투 없음) | - | O | - | - | - | O | - | 10 | 번호 붙은 변형(Exs_RedWinterYoheki_01, Exs_RedWinterYoheki_02) |
| Misaka Mikoto | 전체 | N/K | O | O | O | O | O | O | 32 |  |
| Misaki (Swimsuit) | 카페만 (전투 없음) | - | O | - | - | - | O | - | 12 |  |
| Misaki | 전체 | N/K | O | - | O | O | O | - | 30 | 번호 붙은 변형(Public_01) |
| Miyako (Swimsuit) | 전체 | N/K | O | O | O | O | O | - | 35 |  |
| Miyako | 전체 | N/K | O | O | O | O | O | O | 32 |  |
| Miyo | 전체 | N/K | O | O | O | O | O | - | 33 |  |
| Miyu (Swimsuit) | 카페만 (전투 없음) | - | O | - | - | - | O | - | 11 |  |
| Miyu | 전체 | N/K | O | - | O | O | O | - | 31 |  |
| Moe (Swimsuit) | 전체 | N/K | O | O | O | O | O | O | 32 |  |
| Moe | 카페만 (전투 없음) | - | O | - | - | - | - | - | 7 |  |
| Momiji | 전체 | N/K/S | O | O | O | O | O | O | 38 |  |
| Momoi (Battle) | 불가 (카페 동작 없음) | - | - | - | - | - | - | - | 2 |  |
| Momoi (Maid) | 전체 | N/K | O | O | O | O | O | O | 39 | 폼/특수 접두사 ST_ |
| Momoi | 전체 | N/K/S | O | O | O | O | O | O | 37 |  |
| Mutsuki (Dress) | 카페만 (전투 없음) | - | O | O | - | - | - | - | 8 |  |
| Mutsuki (New Year) | 전체 | N | O | O | O | O | O | - | 23 |  |
| Mutsuki | 전체 | N/S | O | O | O | O | O | - | 33 |  |
| Nagisa (Swimsuit) | 카페만 (전투 없음) | - | O | - | - | - | O | - | 12 |  |
| Nagisa | 카페만 (전투 없음) | - | - | - | - | - | - | - | 6 |  |
| Nagusa (Cut-in) | 불가 (카페 동작 없음) | - | - | - | - | - | - | - | 0 |  |
| Nagusa (Swimsuit) | 전체 | N | O | O | O | O | O | - | 29 |  |
| Nagusa | 전체 | N | O | O | O | O | O | - | 25 |  |
| Natsu (Band) (No Weapon) | 불가 (카페 동작 없음) | - | - | - | - | - | - | - | 5 |  |
| Natsu (Band) | 전체 | N/K | O | O | O | O | O | - | 33 |  |
| Natsu | 전체 | N | O | - | O | O | O | - | 23 |  |
| Neru (Bunny Girl) | 전체 | N/K/S | O | O | O | O | O | - | 38 |  |
| Neru (School Uniform) | 전체 | N/K | O | O | O | O | - | O | 37 | 번호 붙은 변형(Exs01, Exs02) |
| Neru | 전체 | N/K/S | O | O | O | O | O | - | 40 |  |
| Niko | 전체 | N | O | O | O | O | O | - | 25 |  |
| Niya | 카페만 (전투 없음) | - | O | - | - | - | O | - | 9 |  |
| Noa (Pajama) | 전체 | N/K | O | O | O | O | - | O | 34 | 번호 붙은 변형(Exs_01, Exs_02) |
| Noa | 전체 | N/K | O | - | O | O | O | O | 31 |  |
| Nodoka (Hot Spring) | 카페만 (전투 없음) | - | O | - | - | - | - | - | 13 | 폼/특수 접두사 SM016501_ |
| Nodoka | 카페만 (전투 없음) | - | - | - | - | - | - | - | 6 |  |
| Nonomi (Swimsuit) | 전체 | N | O | - | O | O | O | - | 24 | 번호 붙은 변형(Public_01) |
| Nonomi | 불가 (카페 동작 없음) | N/S | - | O | O | O | O | - | 27 |  |
| Nozomi | 전체 | N/K | O | O | O | O | O | O | 34 |  |
| Otogi | 카페 + 전투 이름 대응 필요 | - | O | O | O | O | O | - | 51 | 폼/특수 접두사 Kneel01_ Kneel02_ Normal01_ Normal02_; 번호 붙은 변형(Move_End_Kneel01, Move_End_Normal01) |
| Pina (Guide) | 카페만 (전투 없음) | - | O | - | - | - | O | - | 14 |  |
| Pina | 전체 | N | O | O | O | O | O | - | 26 |  |
| Rabu | 전체 | N | O | O | O | O | O | O | 34 | 번호 붙은 변형(Exs2) |
| Rei | 전체 | N/K | O | O | O | O | O | - | 35 |  |
| Reijo | 전체 | N/K | O | O | O | O | O | O | 31 |  |
| Reisa (Magical) | 카페만 (전투 없음) | - | O | - | - | - | - | - | 12 |  |
| Reisa | 전체 | N | O | O | O | O | O | O | 25 |  |
| Rena | 전체 | N/K | O | O | O | O | O | O | 35 |  |
| Renge (Swimsuit) | 전체 | N/K | O | O | O | O | O | O | 32 |  |
| Renge | 전체 | N/K | O | O | O | O | O | O | 35 |  |
| Rio (Battle) (Scenario) | 불가 (카페 동작 없음) | - | - | - | - | - | - | - | 4 | 번호 붙은 변형(Exs01, Exs02) |
| Rio (Battle) | 전체 | N/K | O | O | O | O | O | O | 33 |  |
| Rio | 카페만 (전투 없음) | - | O | - | - | - | O | - | 14 |  |
| Ritsu | 카페만 (전투 없음) | - | O | - | - | - | O | - | 11 |  |
| Rumi | 전체 | N/K | O | - | O | O | O | O | 31 |  |
| Saki (Swimsuit) | 전체 | N | O | O | O | O | O | - | 29 |  |
| Saki | 카페만 (전투 없음) | - | O | - | - | - | O | - | 9 |  |
| Sakurako (Idol) | 전체 | N/K | O | O | O | O | O | O | 33 |  |
| Sakurako | 전체 | N/K | O | - | O | O | O | O | 32 |  |
| Saori (Dress) (Cafe) | 카페만 (전투 없음) | - | - | - | - | - | - | - | 3 |  |
| Saori (Dress) | 불가 (카페 동작 없음) | N | O | O | O | O | O | - | 24 |  |
| Saori (Swimsuit) | 전체 | N/K | O | O | O | O | O | O | 32 |  |
| Saori | 전체 | N/K | O | O | O | O | O | O | 34 |  |
| Saten Ruiko | 카페만 (전투 없음) | - | - | - | - | - | O | - | 7 |  |
| Satsuki | 카페만 (전투 없음) | - | O | - | - | - | O | - | 12 |  |
| Saya (Casual) | 카페만 (전투 없음) | - | - | - | - | - | O | - | 7 |  |
| Saya | 카페만 (전투 없음) | - | - | - | - | - | O | - | 8 |  |
| Seia (Swimsuit) | 전체 | N/K | O | - | O | O | O | O | 34 |  |
| Seia | 전체 | N/K | O | O | O | O | O | O | 36 |  |
| Sena (Casual) | 전체 | N/K | O | O | O | O | O | - | 35 |  |
| Sena | 카페 + 전투 이름 대응 필요 | - | O | - | - | - | - | - | 19 | 폼/특수 접두사 SM008101_ |
| Serika (New Year) | 카페만 (전투 없음) | - | - | - | - | - | O | - | 9 |  |
| Serika (Swimsuit) | 카페만 (전투 없음) | - | - | - | - | - | O | - | 8 |  |
| Serika | 전체 | N/K/S | O | O | O | O | O | O | 40 |  |
| Serina (Christmas) | 전체 | N/K | O | - | O | O | O | O | 31 | 번호 붙은 변형(Normal_Public01) |
| Serina | 카페만 (전투 없음) | - | - | - | - | - | O | - | 7 |  |
| Shigure (Hot Spring) | 카페만 (전투 없음) | - | - | - | - | - | O | - | 9 |  |
| Shigure | 전체 | N/K | O | O | O | O | O | - | 30 |  |
| Shimiko | 대부분 (집어 들기 대체) | N/K/S | - | - | O | O | - | O | 39 |  |
| Shiroko (Riding) | 전체 | N/K/S | O | O | O | O | O | O | 38 |  |
| Shiroko (Swimsuit) | 카페만 (전투 없음) | - | - | - | - | - | O | - | 10 |  |
| Shiroko | 전체 | N/K/S | O | O | O | O | O | O | 44 |  |
| Shiroko＊Terror | 카페 + 전투 이름 대응 필요 | - | O | O | - | - | - | - | 47 | 폼/특수 접두사 Move01_ Move02_ Normal01_ Normal02_; 번호 붙은 변형(Exs01, Exs02, Exs03 등) |
| Shizuko (Swimsuit) | 카페만 (전투 없음) | - | - | - | - | - | O | - | 11 |  |
| Shizuko | 카페만 (전투 없음) | - | - | - | - | - | - | - | 6 |  |
| Shokuhou Misaki | 전체 | N/K | O | O | O | O | O | - | 34 |  |
| Shun (Kid) | 전체 | N/K | O | - | O | O | O | - | 30 |  |
| Shun (Swimsuit) (1) | 전체 | N/K | O | O | O | O | O | - | 36 | 번호 붙은 변형(Formation_FormChange_Appear_01, Formation_FormChange_Disappear_01) |
| Shun (Swimsuit) (2) | 불가 (카페 동작 없음) | N/K | O | O | O | O | O | - | 33 | 번호 붙은 변형(Formation_FormChange_Appear_02, Formation_FormChange_Disappear_02, FX_CH0355_02_Exs_Cutin_01 등) |
| Shun | 카페 + 전투 이름 대응 필요 | - | O | O | O | O | O | - | 51 | 폼/특수 접두사 Kneel01_ Kneel02_ Normal01_ Normal02_; 번호 붙은 변형(Move_End_Kneel01, Move_End_Kneel02, Move_End_Normal01 등) |
| Subaru | 카페 + 전투 이름 대응 필요 | - | O | O | O | O | O | O | 42 | 폼/특수 접두사 Kneel01_ Kneel02_ Normal01_ Normal02_ |
| Sumire (Part-Timer) | 카페만 (전투 없음) | - | O | - | - | - | O | - | 12 |  |
| Sumire | 전체 | N | O | - | O | O | O | O | 25 | 번호 붙은 변형(Original_Public01) |
| Suzumi (Magical) | 전체 | N/K | O | O | O | O | O | O | 36 |  |
| Suzumi | 전체 | N/K/S | O | O | O | O | O | O | 41 |  |
| Takane | 전체 | N/K | O | O | O | O | O | O | 40 |  |
| Toki (Battle) (Scenario) | 불가 (카페 동작 없음) | N | - | - | O | - | - | - | 12 | 번호 붙은 변형(Exs01, Exs02) |
| Toki (Battle) | 전체 | N/K | O | O | O | O | O | O | 37 |  |
| Toki (Bunny Girl) | 전체 | N/K | O | O | O | O | O | - | 37 |  |
| Toki (Cafe) | 카페만 (전투 없음) | - | - | - | - | - | - | - | 3 |  |
| Toki | 불가 (카페 동작 없음) | - | O | O | - | - | - | - | 43 | 번호 붙은 변형(Exs01, Exs02, Normal_Idle01 등) |
| Tomoe (Qipao) | 카페만 (전투 없음) | - | - | - | - | - | - | - | 15 |  |
| Tomoe | 전체 | N/K | O | O | O | O | O | - | 29 |  |
| Tsubaki (Guide) | 카페만 (전투 없음) | - | - | - | - | - | O | - | 11 |  |
| Tsubaki | 전체 | N | O | O | O | O | O | - | 24 |  |
| Tsukuyo (Dress) | 전체 | N | O | O | O | O | O | - | 25 |  |
| Tsukuyo | 전체 | N/K | O | - | O | O | O | O | 33 |  |
| Tsurugi (Swimsuit) | 카페 + 전투 이름 대응 필요 | - | O | - | O | O | O | - | 35 | 폼/특수 접두사 Move01_ Move02_ Normal01_ Normal02_; 번호 붙은 변형(Normal01_Public01, Normal02_Public01, Move_End_Normal01 등) |
| Tsurugi | 카페 + 전투 이름 대응 필요 | - | O | - | O | O | O | - | 35 | 폼/특수 접두사 Move01_ Move02_ Normal01_ Normal02_; 번호 붙은 변형(Normal01_Public01, Normal02_Public01, Move_End_Normal01 등) |
| Ui (Swimsuit) | 전체 | N/K | O | O | O | O | O | - | 32 |  |
| Ui | 전체 | N/K | O | O | O | O | O | - | 30 |  |
| Umika | 전체 | N/K | O | O | O | O | - | - | 33 | 번호 붙은 변형(Exs01) |
| Utaha (Cheerleader) | 전체 | N | O | O | O | O | O | - | 25 |  |
| Utaha | 카페만 (전투 없음) | - | - | - | - | - | - | - | 6 |  |
| Wakamo (Swimsuit) | 전체 | N/K | O | O | O | O | O | - | 30 |  |
| Wakamo | 전체 | N/K | O | - | O | O | O | O | 34 |  |
| Yakumo | 카페만 (전투 없음) | - | O | - | - | - | O | - | 15 |  |
| Yoshimi (Band) | 전체 | N/K | O | O | O | O | O | O | 38 |  |
| Yoshimi | 카페만 (전투 없음) | - | O | - | - | - | - | - | 7 |  |
| Yukari (Swimsuit) | 전체 | N/K | O | O | O | O | O | O | 34 |  |
| Yukari | 전체 | N | O | O | O | O | O | - | 27 |  |
| Yuuka (Pajama) | 전체 | N/K | O | - | O | O | O | O | 35 |  |
| Yuuka (Sportswear) | 전체 | N/K | O | O | O | O | O | O | 41 |  |
| Yuuka | 전체 | N/K/S | O | O | O | O | O | O | 38 |  |
| Yuzu (Battle) (Carrier) | 불가 (카페 동작 없음) | - | - | - | - | - | - | - | 2 |  |
| Yuzu (Battle) (Cut-in) | 불가 (카페 동작 없음) | - | - | - | - | - | - | - | 0 |  |
| Yuzu (Battle) | 카페만 (전투 없음) | - | O | - | - | - | - | - | 10 | 번호 붙은 변형(Exs01) |
| Yuzu (Maid) | 카페 + 전투 이름 대응 필요 | - | O | - | - | - | O | - | 21 | 폼/특수 접두사 B_ST_ ST_ |
| Yuzu | 전체 | N/K | O | O | O | O | O | - | 30 |  |
| ladies_biker_ar | 불가 (카페 동작 없음) | - | - | - | - | - | - | - | 0 |  |
| ladies_biker_mg | 불가 (카페 동작 없음) | - | - | - | - | - | - | - | 0 |  |
| ladies_biker_sg | 불가 (카페 동작 없음) | - | - | - | - | - | - | - | 0 |  |
| ladiesboss_biker_ar | 불가 (카페 동작 없음) | - | - | - | - | - | - | - | 0 |  |
| sm030001 | 불가 (카페 동작 없음) | - | - | - | O | O | - | - | 5 |  |
| sm032601 | 불가 (카페 동작 없음) | - | - | O | O | O | - | - | 6 |  |
| st0004 | 불가 (카페 동작 없음) | - | - | - | - | - | - | - | 0 |  |
| st0005 | 불가 (카페 동작 없음) | - | - | - | - | - | - | - | 0 |  |
