# Bao cao chuyen sau Shelling - Thang 04/2026

Ngay lap: 2026-05-11  
Pham vi du lieu: 2026-04-01 den 2026-04-30  
Nguon: Supabase `factory-dashboard`, cac bang `daily_plan`, `daily_actual`, `daily_kpi`, `shelling_line_daily`, `downtime_events`

## 1. Tom tat dieu hanh

Shelling dat muc san luong tong the rat sat ke hoach: 1,400.284 tan actual so voi 1,400.000 tan plan, tuong duong 100.0%. Diem can luu y la ket qua nay den tu viec cac ngay dau thang vuot plan manh, trong khi cuoi thang suy giam ro: ngay 24/04 va 25/04 co plan nhung actual bang 0.

Du lieu chi tiet line khop voi bang actual tong ngay, khong co chenh lech san luong dang ke. Do do, co the dung `shelling_line_daily` de phan tich nang suat, broken, manpower va downtime.

Van de lon nhat trong thang la downtime. Bang downtime events ghi nhan 51,995 phut, tuong duong 866.6 gio. Nhom nguyen nhan `LU` chiem 72.4% downtime, chu yeu lien quan den khong co nguyen lieu. Neu nhin theo line, D2 va D1 la hai diem tac nghen lon nhat, dong thoi cung la hai line co nang suat thap nhat.

Chat luong dang vuot nguong muc tieu broken 5.5%: broken binh quan co trong so theo san luong la 5.78%. Line C, D1, D2 la nhom can uu tien xu ly vi broken lan luot 8.42%, 7.23%, 8.11%.

## 2. Do phu va tinh day du du lieu

| Hang muc | Gia tri |
|---|---:|
| Dong ke hoach | 30 ngay |
| Dong actual | 23 ngay |
| Dong KPI | 23 ngay |
| Dong chi tiet line/ca | 345 dong |
| Downtime events | 149 events |
| Ngay co san xuat actual | 20 ngay |
| Ngay co line actual | 20 ngay |

Cac ngay plan = 0: 05/04, 12/04, 19/04, 26/04, 27/04, 28/04, 29/04, 30/04.

Khong co ngay nao co plan > 0 nhung thieu dong actual. Tuy nhien 24/04 va 25/04 co plan nhung actual = 0, nen can xac nhan day la dung ngung san xuat hay data chua nhap.

## 3. KPI tong thang

| KPI | Gia tri |
|---|---:|
| Plan | 1,400.000 tan |
| Actual | 1,400.284 tan |
| Dat ke hoach | 100.0% |
| Tong gio chay line | 1,383.17 gio |
| Nang suat trung binh | 1.012 tan/gio |
| Manpower tong theo dong line/ca | 484 |
| San luong / manpower | 2.893 tan/man-shift |
| Downtime theo line | 44,095 phut |
| Downtime theo events | 51,995 phut |
| Broken co trong so theo san luong | 5.78% |
| Broken trung binh khong trong so | 6.18% |

Ghi chu: `input_ton` va `good_output_ton` cua KPI Shelling trong thang 4 dang bang 0, nen khong tinh duoc yield theo input/output tu bang `daily_kpi`.

## 4. Dien bien theo ngay

5 ngay san luong cao nhat:

| Ngay | Actual | Plan | Dat KH | Broken line | Tan/gio |
|---|---:|---:|---:|---:|---:|
| 02/04 | 86.4 | 63.7 | 135.6% | 5.18% | 1.09 |
| 03/04 | 83.9 | 63.6 | 131.9% | 5.15% | 0.99 |
| 04/04 | 83.2 | 63.6 | 130.8% | 6.20% | 0.89 |
| 01/04 | 82.9 | 63.6 | 130.3% | 5.91% | 1.11 |
| 17/04 | 78.0 | 63.6 | 122.7% | 6.61% | 1.13 |

5 ngay kem nhat theo ty le dat ke hoach:

| Ngay | Actual | Plan | Dat KH | Downtime events |
|---|---:|---:|---:|---:|
| 24/04 | 0.0 | 63.7 | 0.0% | 180 phut |
| 25/04 | 0.0 | 63.6 | 0.0% | 0 phut |
| 18/04 | 42.5 | 63.7 | 66.8% | 4,560 phut |
| 23/04 | 51.8 | 63.6 | 81.4% | 2,430 phut |
| 22/04 | 52.1 | 63.6 | 81.9% | 2,880 phut |

Mau hinh ro: 01-17/04 phan lon vuot plan, sau do 18-25/04 sut giam. Neu loai 24-25/04, nhom 18-23/04 van cho thay san luong thap hon muc dau thang, gan voi downtime cao do LU/WT.

## 5. Phan tich theo line

| Line | San luong | Ty trong | Gio chay | Tan/gio | Downtime | Availability uoc tinh | Tan/man | Broken |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| A | 322.242 | 23.0% | 303.83 | 1.061 | 7,045 phut | 72.1% | 3.222 | 2.22% |
| B | 397.451 | 28.4% | 328.17 | 1.211 | 5,930 phut | 76.9% | 3.822 | 4.78% |
| C | 361.488 | 25.8% | 347.42 | 1.040 | 3,875 phut | 84.3% | 3.476 | 8.42% |
| D1 | 179.459 | 12.8% | 211.25 | 0.850 | 12,785 phut | 49.8% | 2.243 | 7.23% |
| D2 | 139.644 | 10.0% | 192.50 | 0.725 | 14,460 phut | 44.4% | 1.455 | 8.11% |

Nhan dinh:

- Line B la line manh nhat ve san luong, nang suat va tan/man: 397.451 tan, 1.211 tan/gio, 3.822 tan/man.
- Line A co broken tot nhat: 2.22%, thap hon xa muc muc tieu 5.5%.
- Line C co san luong cao nhung broken rat xau: 8.42%. Day la uu tien chat luong so 1.
- D1 va D2 vua thap ve san luong, vua cao downtime, vua cao broken. D2 la diem can xu ly dau tien neu muc tieu la tang output cuoi thang.

## 6. Phan tich theo ca

| Ca | San luong | Ty trong | Gio chay | Tan/gio | Downtime | Availability uoc tinh | Tan/man | Broken |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Ca 1 | 444.943 | 31.8% | 462.34 | 0.962 | 14,905 phut | 65.0% | 2.730 | 5.83% |
| Ca 2 | 521.519 | 37.2% | 503.16 | 1.036 | 10,790 phut | 73.7% | 2.997 | 5.91% |
| Ca 3 | 433.822 | 31.0% | 417.67 | 1.039 | 18,400 phut | 57.7% | 2.951 | 5.56% |

Ca 2 dong gop san luong lon nhat va co availability tot nhat. Ca 3 co tan/gio tuong duong Ca 2, nhung downtime cao nhat va availability thap nhat; day la dau hieu ca 3 khong kem khi may chay, nhung bi mat thoi gian kha nhieu.

## 7. Phan tich theo size

| Size | San luong | Ty trong | Tan/gio | Broken |
|---|---:|---:|---:|---:|
| C2 | 314.026 | 22.4% | 1.056 | 8.31% |
| C1 | 215.450 | 15.4% | 1.128 | 5.45% |
| B2 | 201.444 | 14.4% | 1.163 | 4.93% |
| B1 | 164.473 | 11.7% | 1.321 | 2.42% |
| D2 | 152.960 | 10.9% | 0.868 | 7.17% |
| D1 | 151.256 | 10.8% | 0.758 | 8.23% |
| A2 | 109.919 | 7.8% | 0.928 | 2.49% |
| A1 | 56.697 | 4.0% | 0.932 | 1.89% |
| N/A | 34.059 | 2.4% | 0.811 | 5.74% |

Size C2 la volume driver lon nhat nhung broken 8.31%, day la nguon anh huong chat luong lon nhat cua thang. Size D1/D2 cung xau ve broken va nang suat, nhung tong volume thap hon C2.

## 8. Phan tich theo leader

| Leader | San luong | Gio chay | Tan/gio | Tan/man | Broken |
|---|---:|---:|---:|---:|---:|
| Mrs. Tam | 526.861 | 478.00 | 1.102 | 3.028 | 5.84% |
| Ms. Linh | 419.702 | 426.33 | 0.984 | 2.817 | 5.59% |
| Mr. Tri | 400.921 | 427.09 | 0.939 | 2.884 | 5.84% |

Ghi chu du lieu: co mot so dong bi loi encoding ten leader (`Mr. TrÃ­`, `Mrs. TÃ¢m`). Khi gop ve dung ten, Mrs. Tam van la nhom co san luong va tan/gio cao nhat. Tuy nhien broken cua ca ba leader deu xoay quanh nguong 5.5%-5.8%, khong co nhom nao that su on dinh duoi target tren toan thang.

## 9. Downtime

Tong downtime events: 51,995 phut, tuong duong 866.6 gio.

Theo root cause:

| Root cause | Events | Phut | Gio | Ty trong |
|---|---:|---:|---:|---:|
| LU | 82 | 37,635 | 627.3 | 72.4% |
| WT | 36 | 10,895 | 181.6 | 21.0% |
| BD | 21 | 1,815 | 30.3 | 3.5% |
| CIL | 9 | 1,620 | 27.0 | 3.1% |
| PT | 1 | 30 | 0.5 | 0.1% |

Theo khu vuc/may:

| Khu vuc | Events | Phut | Gio |
|---|---:|---:|---:|
| Line D2 | 41 | 16,680 | 278.0 |
| Line D1 | 37 | 14,825 | 247.1 |
| Line A | 27 | 7,885 | 131.4 |
| Line B | 23 | 7,010 | 116.8 |
| Line C | 18 | 5,195 | 86.6 |
| MBM | 3 | 400 | 6.7 |

Ket luan downtime: day khong phai van de bao tri thuan tuy. `BD` chi chiem 3.5%. Nguyen nhan lon nhat la `LU` va `WT`, gan voi cap lieu/nguyen lieu va cho hang dat am. Neu chi tap trung sua may, se khong cham vao 93.4% downtime chinh.

## 10. Bat thuong chat luong

Cac dong broken cao nhat, vuot target 5.5%:

| Ngay | Line | Ca | Size | Leader | Tan | Broken |
|---|---|---|---|---|---:|---:|
| 20/04 | D1 | Ca 3 | D2 | Ms. Linh | 3.56 | 16.40% |
| 14/04 | D1 | Ca 1 | D2 | Mr. Tri | 4.09 | 11.70% |
| 16/04 | D2 | Ca 2 | D1 | Mrs. Tam | 2.24 | 11.70% |
| 13/04 | D2 | Ca 2 | D1 | Mrs. Tam | 5.31 | 11.30% |
| 15/04 | D2 | Ca 2 | D1 | Mrs. Tam | 7.00 | 11.30% |
| 22/04 | C | Ca 3 | C2 | Mr. Tri | 4.20 | 11.30% |
| 16/04 | C | Ca 2 | C2 | Mrs. Tam | 8.15 | 11.20% |
| 16/04 | D2 | Ca 1 | D1 | Mr. Tri | 7.26 | 11.10% |
| 04/04 | C | Ca 2 | C2 | Mr. Tri | 7.30 | 11.00% |
| 18/04 | C | Ca 1 | C1 | Mr. Tri | 7.70 | 11.00% |

Mau hinh bat thuong:

- Cac ca broken cao tap trung o line C, D1, D2.
- Size C2, D1, D2 lap lai nhieu trong danh sach.
- Ngay 15-16/04 co nhieu diem broken cao, can doi chieu lo nguyen lieu, do am, setup may va dao cat trong cac ca nay.

## 11. Diem manh

- Tong thang van dat 100.0% ke hoach mac du cuoi thang roi manh.
- Line B la benchmark tot ve output: san luong cao nhat, tan/gio cao nhat, tan/man cao nhat, broken duoi target.
- Line A la benchmark chat luong: broken 2.22%.
- Du lieu tong ngay va du lieu line khop, nen he thong co nen tang tot cho dashboard quan tri theo line/ca.

## 12. Rui ro va diem can xu ly

1. Rui ro supply/nguyen lieu la lon nhat. `LU` + `WT` chiem 93.4% downtime events. Can tach ro `LU` la thieu nguyen lieu that, chua cap kip, hay khong co hang dung condition.

2. D1/D2 dang lam giam nang luc he thong. Hai line nay chi dong gop 22.8% san luong nhung mang phan lon downtime va broken cao. D2 co tan/gio 0.725 va availability uoc tinh 44.4%.

3. C2 la size co anh huong chat luong lon nhat. Volume 314.026 tan, broken 8.31%. Day la noi mot diem cai thien nho co the keo KPI broken toan thang xuong nhanh.

4. Cuoi thang co khoang trong san xuat/du lieu. 24/04 va 25/04 co plan nhung actual bang 0. 26-30/04 plan bang 0. Can xac nhan day la lich ngung san xuat, nghi le, hay thieu nhap data.

5. Du lieu leader co loi encoding. `Mr. TrÃ­` va `Mrs. TÃ¢m` nen duoc chuan hoa ve `Mr. Tri` va `Mrs. Tam` de bao cao leader khong bi tach dong.

## 13. Khuyen nghi hanh dong

Uu tien 1: Giam downtime LU/WT  
Thiet lap review hang ngay cho nguyen nhan `LU` va `WT`: ngay nao, line nao, ca nao, size nao, lot nao. Muc tieu khong phai ghi nhan downtime, ma la phan loai duoc viec nao thuoc ke hoach cap lieu, viec nao thuoc chuan bi do am, viec nao thuoc dieu phoi san xuat.

Uu tien 2: Xu ly D2 va D1 nhu mot du an rieng  
D2 can kiem tra ca availability va setup van hanh, vi dang thap nhat ve tan/gio, tan/man va cao nhat ve downtime. D1 co broken dot bien 16.4% ngay 20/04, can truy ve lot/size D2 va dieu kien may trong Ca 3.

Uu tien 3: Chuyen best practice tu line A/B sang C/D  
Line A cho thay broken co the o muc 2.22%; Line B cho thay co the giu san luong cao voi broken 4.78%. Nen doi chieu thong so setup, dao cat, toc do cap lieu, quy trinh kiem tra size giua A/B va C/D.

Uu tien 4: Lap dashboard canh bao broken theo line-size-ca  
Nguong canh bao nen dat o 5.5%. Rieng C2, D1, D2 nen co view rieng vi la nhom keo broken thang len cao.

Uu tien 5: Lam sach master data  
Chuan hoa leader name, bat buoc nhap size cho dong co san luong, va xac nhan logic ghi downtime giua `shelling_line_daily.downtime_min` va `downtime_events.duration_mins` vi hai tong dang lech 7,900 phut.

## 14. Ket luan

Thang 04/2026 cua Shelling dat ke hoach tren tong san luong, nhung chat luong va tinh on dinh van la diem yeu. Bai toan quan trong khong nam o viec tang toc tat ca line, ma nam o viec lam on dinh D1/D2, giam downtime do LU/WT, va ha broken cho nhom C2/D1/D2. Neu khong xu ly cac diem nay, thanh tich 100% cua thang 4 se phu thuoc vao viec dau thang chay vuot de bu cho cuoi thang, thay vi mot he thong san xuat on dinh.
