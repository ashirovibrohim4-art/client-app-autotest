# Noor client app — topilgan buglar (Delivery)

`bugs.log` har yurishda tozalanadi; bu fayl doimiy ro'yxat.

## 2026-11-24 / 25

| # | Muhimlik | Bug | Dalil |
|---|---|---|---|
| 1 | ✅ Tuzatildi (25.11) | Sabab: tarifning maksimal masofa (km) chegarasi — 3 manzilli marshrut undan oshgan. Max km 100 qilindi. **Eski tavsif:** 3 va undan ko'p yetkazish manzilli buyurtma yaratilmaydi — `POST /api/v1/orders/eval` va `POST /api/v1/orders` → 422 `{"error":"order.delivery.tariff.not.found"}` (2 manzil bilan 200) | x-request-id `f2a69f64-0233-4ef7-ac5c-f64e9828daf9` |
| 2 | O'rta | **Client:** `/orders/eval` 422 qaytganda formada eski narx qoladi (29 000 → 29 000), xato ko'rsatilmaydi; "Buyurtma berish" 422 olganda ham foydalanuvchiga hech narsa chiqmaydi | 3 manzilli forma |
| 3 | Yuqori | **Client:** ilova o'z-o'zidan tizimdan chiqib ketadi / mehmon rejimiga tushadi ("Akkauntingizga kiring") — 23.11 da 2 marta, 24.11 ~20:40, 25.11 ertalab | — |
| 4 | Past | **Client (UZ):** kuzatuv ekranida to'lov turi inglizcha — "Cash", "Card" ("Naqd", "Karta" bo'lishi kerak) | #64957632, #33632266, #24662434 |
| 5 | Past | **Client:** holat matni "Haydovchi yetib keldi" — boshqa joylarda "Kuryer" | F2 jonli holatlar |
| 6 | Past | **Client:** olib ketish manzili ruscha ko'rsatiladi ("Мукимий улица, 2/1"), tarixda ham ruscha manzillar | kuzatuv ekrani |
| 7 | Past | **Client:** bosh sahifada "Sizda 5 ta faol buyurtma bor", ro'yxatda faqat 2 ta faol | 24.11 18:55 |

| 12 | Past (eslatma) | **Client:** qabul qiluvchi tanlanmagan manzil uchun faqat narx so'rovida (`POST /api/v1/orders/eval`) o'rnini bosuvchi raqam ketadi: `"phone": "+998936669953", "name": "Qabul qiluvchi"`. Buyurtma bo'sh telefon bilan yaratilmaydi (B1), shuning uchun foydalanuvchiga ta'siri yo'q — dasturchiga eslatma | `reports/repro/` (13:20, 25.11), x-request-id e0ab5c55-…, f2a69f64-… |
| 14 | O'rta | **Avtorizatsiya:** telefon raqamida faqat uzunlik (9 raqam) tekshiriladi, operator kodi tekshirilmaydi — "00 000 00 00", "00 123 45 67", "12 123 45 67", "66 123 45 67" bilan ham SMS kod so'raladi va "Endi kodni kiriting" ekrani ochiladi. Mavjud bo'lmagan raqamlarga SMS yuborish so'rovi serverga ketadi (SMS xarajati, spam xavfi). Kutilgan: faqat O'zbekiston operator kodlari (33, 50, 55, 77, 88, 90, 91, 93, 94, 95, 97, 98, 99, 20…) qabul qilinsin | 01-auth P5–P8 (25.11) |
| 15 | O'rta | **Avtorizatsiya:** raqam "+998" bilan kiritilsa/qo'yilsa (`+998997274471`) maydonda "998997274" qoladi — "998" raqamning boshi deb olinadi, oxirgi 3 raqam kesiladi, natijada boshqa (noto'g'ri) raqam. Kutilgan: "+998"/"998" prefiksi olib tashlanib, 9 raqam saqlansin (kontaktlardan nusxa olinganda ko'p uchraydi) | 01-auth P12 |
| 16 | Past | **Avtorizatsiya:** OTP ("Endi kodni kiriting") ekranida Android "Orqaga" tugmasi hech narsa qilmaydi — faqat yuqoridagi ✕ bilan chiqiladi | 01-auth O7 |
| 17 | Past | **Avtorizatsiya:** rozilik belgilari qo'yilmaganda "Kodni olish" jim ishlamaydi — qaysi belgi kerakligi haqida xabar yo'q (telefon xato bo'lsa "Telefon raqami noto'g'ri formatda" chiqadi, belgilar uchun hech narsa) | 01-auth T1–T3 |
| 13 | O'rta | **Client:** yangi qo'shilgan manzilga OLDINGI buyurtmaning izohi avtomatik tushadi — qoralama izohlarni manzil bo'yicha emas, tartib raqami (3-nuqta) bo'yicha saqlaydi. 25.11 da yangi qo'shilgan "Chorsu savdo markazi"da 24.11 dagi "F2-A-N2 qavat 4 kv 12 uy 7" izohi turgan. Foydalanuvchi bilmasdan eski izohni yuborishi mumkin | F1 skrinshoti 13:48 |
| 8 | O'rta | **Kuryer ilovasi:** naqd buyurtma "Не оплачено" holatida "Доставлено" qilinadi — naqd olinganini tasdiqlash qadami yo'q | C1–C4 |
| 9 | O'rta | **Backend/Client:** olib ketish va yetkazish manzili bir xil bo'lsa ham buyurtma yaratiladi | #21666715 (B4) |
| 10 | Past | **Client:** qisqa telefon ("+998 90 123") qabul qiluvchi sifatida qabul qilinadi; bo'sh telefon — faqat "!" belgisi, xato matni yo'q | A9, B1 |
| 11 | Past | **Client:** "Marshrut" → "Bekor qilish" nuqtalar tartibini qaytarmaydi | A10 |

### Tekshirilishi kerak (ehtimoliy)
- C1: yakunlangan #99639850 bo'yicha "Bildirishnomalar"da xabar topilmadi (yangi versiyada format o'zgargan bo'lishi mumkin).
- C5: "Kvitansiya OFD" yakunlangandan keyin ham "Kvitansiya ishlanmoqda..." ko'rsatadi.
- C2: yetkazish nuqtasi izohi kuryerga ko'rinmadi — test faqat qabul paytida o'qigan (F2 da izohlar kuryerga yetib borgan), ehtimol test xatosi.

## Bug emas (tekshirildi)
- Qo'lda biriktirilgan buyurtma "boshqa raqam" bilan chiqdi — XATO xulosa: #24675335 kuryer topilmagani uchun avtomatik bekor qilingan, #34329673 — alohida yangi buyurtma (20:35), u to'g'ri yakunlangan.
- Karta "ko'rsatilmadi" — test xatosi: karta "Card 5614********9539" ko'rinishida chiqadi.
- 3-nuqta qo'shilganda narx o'zgarmadi — sababi bug #1/#2 (eval 422).

## Ishlayotgani tasdiqlangan
- Jonli holatlar (websocket, ilovani qayta ochmasdan): Haydovchi yetib keldi → "HH:MM da yetkazib beramiz" → … → Yetkazib berildi (#33632266, 2 manzil).
- Eshikdan eshikgacha narxni oshiradi (29 000 → 33 500).
- Podyezd va izoh (qavat/kv/uy) kuryerga to'g'ri boradi ("1-подъезд", "F2-B-N0 qavat 2 kv 10 uy 5").
- Karta buyurtmasini kuryer qabul qilmasdan bekor qilish — "Bekor qilindi", karta yechilmadi.
- Sessiya (2026-11-27, Pixel 6 Pro, 2.1.0+211) — 22 holatda akkauntdan chiqarib yubormadi: force-stop, am kill, trim-memory, internetsiz ochish, internet uzilishi, samolyot rejimi, Doze, restricted standby, quvvat tejash, "Don't keep activities", joylashuv/bildirishnoma ruxsatini olish, ekran burilishi, tungi rejim, shrift, kesh tozalash, soat +2/+10 kun, til RU↔UZ, telefonni qayta yoqish, ilovani ustidan qayta o'rnatish. Avtomatik: `npm run test:session` (08-session, eng oxirida).
  Eslatma: adb bilan o'rnatilganda ilova Play Market "Get app" sahifasiga chiqarib yuboradi — `adb install-multiple -r -i com.android.vending …` bilan o'rnatish kerak.

## Yuklama testi (2026-11-27, Pixel 6 Pro, 2.1.0+211) — faqat naqd Delivery, buyurtmalar qoldirildi (foydalanuvchi qarori)
- **UI (ilova orqali, `npm run test:load`, LOAD_COUNT=20/40):** 20/20 va 35/35 xatosiz (40 talik yugurish foydalanuvchi so'rovi bilan 35 da to'xtatildi). Bitta buyurtma ~28–31 s, sekinlashish yo'q (dastlabki 5 ta 28.8 s, oxirgi 5 ta 28.5 s). Bosh sahifa "Sizda 20 ta faol buyurtma bor" to'g'ri, Buyurtmalar ro'yxati 1.4 s da ochildi, 20/20 ko'rindi. 13-buyurtmadan narx 19 500 → 23 500 (talab oshganda narx oshishi bo'lishi mumkin).
  Eslatma: faol buyurtmalar ko'p bo'lganda shu telefondagi kuryer ilovasi oldinga chiqib client ekranini yopadi — test har buyurtmadan oldin uni force-stop qiladi.
- **API (`node capture-token.mjs` → `node load-api.mjs 40`):** POST https://tback.noor.uz/api/v1/orders — ketma-ket 40/40 (200), o'rtacha 171 ms, p95 255 ms, 5.8 so'rov/s; bir vaqtda 40 ta 40/40 (200), o'rtacha 1335 ms, p95 2246 ms, 17.6 so'rov/s (parallelda javob ~8 barobar sekinlashadi, xato yo'q). Server: `active_count` 83.
- **Xavf (bug emas, e'tibor uchun):** bitta klient bir necha soniyada 80+ ta faol buyurtma yarata oldi — faol buyurtmalar soniga cheklov ham, so'rov chastotasiga (rate limit) cheklov ham yo'q.
