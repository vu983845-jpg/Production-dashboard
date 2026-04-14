"""
Phân tích Hồi quy Đơn biến - Xác định Baseload Điện từ dữ liệu EVN
====================================================================
Mô hình: E_total = a * RCN_production + b
  - b (intercept) = Fixed/Non-production electricity (baseload)
  - a (slope)     = Điện biến thiên theo sản xuất (kWh/tấn RCN)
  
Các khái niệm cần trả lời:
  1. Base load electricity   = intercept b (kWh/ngày)
  2. Idle power consumption  = xấp xỉ b (ngày nhàn rỗi, không sản xuất)  
  3. Standby power consumption = điện thực tế ngày Off (quan sát trực tiếp)
  4. Fixed electricity consumption = b từ hồi quy
"""

import csv
import re
import math
from datetime import datetime

# ─── 1. Parse CSV ───────────────────────────────────────────────────────────

def clean_num(s):
    """Loại bỏ dấu phẩy, khoảng trắng, ký tự đặc biệt và chuyển về float."""
    if not s:
        return None
    s = s.strip().replace(',', '').replace(' ', '').replace('\u00a0', '')
    # Xử lý dấu ngoặc âm kiểu kế toán (1,234.56) => -1234.56
    if s.startswith('(') and s.endswith(')'):
        s = '-' + s[1:-1]
    try:
        return float(s)
    except:
        return None

rows = []
with open('tram_dien.csv', encoding='utf-8-sig', errors='replace') as f:
    reader = csv.reader(f)
    for i, line in enumerate(reader):
        # Bỏ qua header (các dòng < 12)
        if i < 11:
            continue
        # Cột layout (0-indexed):
        # col[2]  = Ngày (date)
        # col[3]  = Bình thường kWh (cumulative meter - NOT daily usage!)
        # col[4]  = Cao điểm kWh   (cumulative)
        # col[5]  = Thấp điểm kWh  (cumulative)
        # col[6]  = Tổng (cumulative)
        # col[7]  = Tổng daily (DAILY kWh consumption) <-- đây là dữ liệu chính
        # col[8]  = Daily Est  
        # col[9]  = Production status / department notes
        # col[10..15] = Steaming, Shelling, Borma, MCPeeling, Color, Packing
        
        if len(line) < 8:
            continue
        
        date_str = line[2].strip() if len(line) > 2 else ''
        # Parse date
        dt = None
        for fmt in ('%m/%d/%Y', '%d/%m/%Y'):
            try:
                dt = datetime.strptime(date_str, fmt)
                break
            except:
                pass
        if dt is None:
            continue
        
        # Chỉ lấy dữ liệu từ tháng 7/2024 trở đi (có số EVN thực)
        if dt < datetime(2024, 7, 1):
            continue
        
        # Daily kWh (col 7 = "Tổng" daily)
        daily_kwh = clean_num(line[7]) if len(line) > 7 else None
        
        # Daily Est (col 8) - ước tính từ mô hình cũ / thực tế
        daily_est = clean_num(line[8]) if len(line) > 8 else None
        
        # Production run/off flags (col 9)
        prod_note = line[9].strip() if len(line) > 9 else ''
        steaming  = line[10].strip() if len(line) > 10 else ''
        shelling  = line[11].strip() if len(line) > 11 else ''
        
        # Xác định trạng thái sản xuất
        all_run = all(
            (line[col].strip().lower() == 'run' if len(line) > col else False)
            for col in range(10, 16)
        )
        all_off = all(
            (line[col].strip().lower() == 'off' if len(line) > col else False)
            for col in range(10, 16)
        )
        
        if daily_kwh is not None and daily_kwh > 0:
            rows.append({
                'date': dt,
                'daily_kwh': daily_kwh,
                'daily_est': daily_est,
                'all_run': all_run,
                'all_off': all_off,
                'steaming': steaming,
                'shelling': shelling,
            })

print(f"Tổng số ngày có dữ liệu điện thực: {len(rows)}")

# ─── 2. Phân loại ngày ───────────────────────────────────────────────────────

run_days = [r for r in rows if r['all_run']]
off_days = [r for r in rows if r['all_off']]
partial  = [r for r in rows if not r['all_run'] and not r['all_off'] and r['daily_kwh'] is not None]

print(f"  Ngày Full Run (tất cả dept): {len(run_days)}")
print(f"  Ngày Full Off (tất cả dept): {len(off_days)}")
print(f"  Ngày Partial / Mixed:        {len(partial)}")

# ─── 3. Standby / Idle từ ngày Off ───────────────────────────────────────────

off_kwh = [r['daily_kwh'] for r in off_days]
if off_kwh:
    mean_off = sum(off_kwh) / len(off_kwh)
    sorted_off = sorted(off_kwh)
    
    # Median
    n = len(sorted_off)
    med_off = (sorted_off[n//2 - 1] + sorted_off[n//2]) / 2 if n % 2 == 0 else sorted_off[n//2]
    
    # Std dev
    var_off = sum((x - mean_off)**2 for x in off_kwh) / n
    std_off = math.sqrt(var_off)
    
    print(f"\n{'='*60}")
    print(f"STANDBY / IDLE POWER (ngày Off - không sản xuất)")
    print(f"{'='*60}")
    print(f"  Số ngày Off có dữ liệu : {len(off_kwh)}")
    print(f"  Trung bình (Mean)      : {mean_off:,.0f} kWh/ngày")
    print(f"  Trung vị  (Median)     : {med_off:,.0f} kWh/ngày")
    print(f"  Std Dev                : {std_off:,.0f} kWh/ngày")
    print(f"  Min                    : {min(off_kwh):,.0f} kWh/ngày")
    print(f"  Max                    : {max(off_kwh):,.0f} kWh/ngày")
    print(f"\n  => Standby power consumption ≈ {med_off:,.0f} kWh/ngày")
    print(f"     (tương đương ~{med_off/24:,.0f} kW liên tục)")
else:
    mean_off = None
    med_off = None
    print("\nKhông có ngày Off có dữ liệu điện.")

# ─── 4. Hồi quy đơn biến: E = a*X + b ────────────────────────────────────────
# Biến X: sử dụng Daily Est (nếu có) hoặc phân loại nhị phân run=1/off=0
# Vì CSV có cột "Daily Est" (kWh ước tính dựa trên sản xuất), ta có thể dùng
# trực tiếp. Nhưng để hồi quy đơn biến đúng nghĩa, ta dùng tất cả dữ liệu
# và phân theo 2 nhóm (0=off, 1=run_full) và giá trị điện thực.

# Phương án 1: Dùng nhị phân X=0 (off) / X=1 (full run)
# E = a * X + b => b = điện khi X=0 (off), b+a = điện khi X=1 (full run)

run_kwh = [r['daily_kwh'] for r in run_days]
if run_kwh and off_kwh:
    mean_run   = sum(run_kwh)  / len(run_kwh)
    mean_off_v = sum(off_kwh)  / len(off_kwh)
    
    # Hồi quy nhị phân: b = mean_off, a = mean_run - mean_off
    b_binary = mean_off_v
    a_binary = mean_run - mean_off_v
    
    print(f"\n{'='*60}")
    print(f"HỒI QUY ĐƠN BIẾN - Phương án 1: Binary X (0=Off, 1=Run)")
    print(f"{'='*60}")
    print(f"  E = {a_binary:,.0f} * X + {b_binary:,.0f}")
    print(f"  Intercept b (fixed/non-production) = {b_binary:,.0f} kWh/ngày")
    print(f"  Slope a (variable production elec)  = {a_binary:,.0f} kWh/ngày")

# Phương án 2: OLS thuần túy với toàn bộ dữ liệu có daily_est
data_ols = [(r['daily_est'], r['daily_kwh']) for r in rows
            if r['daily_est'] is not None and r['daily_kwh'] is not None
            and 100 < r['daily_kwh'] < 30000  # lọc outlier
            and r['daily_est'] > 0]

if len(data_ols) >= 10:
    n   = len(data_ols)
    xs  = [d[0] for d in data_ols]
    ys  = [d[1] for d in data_ols]
    xb  = sum(xs) / n
    yb  = sum(ys) / n
    
    Sxx = sum((x - xb)**2 for x in xs)
    Sxy = sum((x - xb)*(y - yb) for x, y in zip(xs, ys))
    
    a = Sxy / Sxx
    b = yb - a * xb
    
    # R²
    SS_tot = sum((y - yb)**2 for y in ys)
    SS_res = sum((y - (a*x + b))**2 for x, y in zip(xs, ys))
    r2 = 1 - SS_res / SS_tot
    
    # Standard error of estimate
    se = math.sqrt(SS_res / (n - 2))
    
    print(f"\n{'='*60}")
    print(f"HỒI QUY ĐƠN BIẾN - Phương án 2: OLS (Daily Est vs Actual)")
    print(f"{'='*60}")
    print(f"  Số điểm dữ liệu : {n}")
    print(f"  E_actual = {a:.4f} * E_est + {b:,.0f}")
    print(f"  R² = {r2:.4f}  ({r2*100:.1f}%)")
    print(f"  Standard Error = ±{se:,.0f} kWh")
    print(f"\n  => Intercept b = {b:,.0f} kWh/ngày")
    print(f"     (Fixed/non-production electricity)")
else:
    print(f"\nKhông đủ dữ liệu OLS với Daily Est ({len(data_ols)} điểm).")
    a, b, r2 = None, None, None

# ─── 5. Phân tích nhóm run để ước lượng baseload từ phổ kWh ─────────────────

if run_kwh:
    sorted_run = sorted(run_kwh)
    n_run = len(sorted_run)
    p5  = sorted_run[int(0.05 * n_run)]
    p10 = sorted_run[int(0.10 * n_run)]
    p25 = sorted_run[int(0.25 * n_run)]
    p50 = sorted_run[int(0.50 * n_run)]
    p75 = sorted_run[int(0.75 * n_run)]
    p90 = sorted_run[int(0.90 * n_run)]
    
    print(f"\n{'='*60}")
    print(f"PHÂN PHỐI ĐIỆN NGÀY FULL RUN ({n_run} ngày)")
    print(f"{'='*60}")
    print(f"  P5   (5th percentile)  : {p5:,.0f} kWh")
    print(f"  P10 (10th percentile)  : {p10:,.0f} kWh")
    print(f"  P25  (Q1)              : {p25:,.0f} kWh")
    print(f"  P50  (Median)          : {p50:,.0f} kWh")
    print(f"  P75  (Q3)              : {p75:,.0f} kWh")
    print(f"  P90 (90th percentile)  : {p90:,.0f} kWh")
    print(f"  Mean                   : {sum(run_kwh)/len(run_kwh):,.0f} kWh")
    print(f"  Max                    : {max(run_kwh):,.0f} kWh")

# ─── 6. TỔNG HỢP KẾT QUẢ ────────────────────────────────────────────────────

print(f"\n{'='*60}")
print(f"KẾT LUẬN - CÁC CHỈ SỐ BASELOAD / FIXED ELECTRICITY")
print(f"{'='*60}")

if off_kwh:
    print(f"\n1. STANDBY POWER CONSUMPTION (chế độ chờ / ngày Off hoàn toàn)")
    print(f"   = {med_off:,.0f} kWh/ngày  (median thực quan sát)")
    print(f"   = ~{med_off/24:,.0f} kW trung bình liên tục")
    print(f"   (Đây là điện thực tế khi KHÔNG có bất kỳ bộ phận nào chạy)")

if off_kwh and run_kwh:
    print(f"\n2. BASELOAD / FIXED ELECTRICITY (từ hồi quy binary)")
    print(f"   = {b_binary:,.0f} kWh/ngày")
    print(f"   (Phần cố định, không phụ thuộc sản xuất)")
    print(f"   Điện biến đổi khi sản xuất đầy đủ: +{a_binary:,.0f} kWh/ngày")

if a is not None:
    print(f"\n3. FIXED ELECTRICITY từ OLS regression")
    print(f"   = {b:,.0f} kWh/ngày  (intercept)")
    print(f"   R² = {r2*100:.1f}% (mức độ giải thích của mô hình)")

if off_kwh and run_kwh:
    print(f"\n4. IDLE POWER CONSUMPTION (nhàn rỗi, máy chờ)")
    print(f"   ≈ Giữa standby ({med_off:,.0f}) và full-run ({sum(run_kwh)/len(run_kwh):,.0f})")
    ratio = med_off / (sum(run_kwh)/len(run_kwh)) * 100
    print(f"   Standby chiếm {ratio:.1f}% so với ngày sản xuất bình thường")
    print(f"   => Idle ~{med_off:,.0f} – {b_binary:,.0f} kWh/ngày")

print(f"\n{'='*60}")
print("GHI CHÚ:")
print("  - Dữ liệu từ 07/2024 trở đi (trước đó không có số EVN thực)")
print("  - 'Off' = tất cả 6 bộ phận đều ghi nhận Off trong ngày đó")
print("  - Biến động kWh ngày Off do máy lạnh, chiếu sáng, dây chuyền lạnh")
print("    vận hành liên tục dù không sản xuất")
print(f"{'='*60}")

# ─── 7. In mẫu ngày Off để kiểm tra ─────────────────────────────────────────
print(f"\nMẪU CÁC NGÀY OFF (để xác minh):")
for r in sorted(off_days, key=lambda x: x['daily_kwh'])[:10]:
    print(f"  {r['date'].strftime('%d/%m/%Y')}  {r['daily_kwh']:,.0f} kWh")
