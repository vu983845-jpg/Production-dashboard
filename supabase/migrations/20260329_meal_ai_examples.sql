-- Bảng lưu ví dụ huấn luyện AI báo cơm
-- Admin/HR thêm ví dụ thực tế để AI học pattern của nhà máy

CREATE TABLE IF NOT EXISTS meal_ai_examples (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title       TEXT NOT NULL,                -- Tên/mô tả ví dụ (vd: "Châu MC Peeling Ca 2")
    input_text  TEXT NOT NULL,                -- Đoạn text Zalo gốc
    expected_json JSONB NOT NULL,             -- Kết quả JSON mong muốn
    dept_hint   TEXT,                         -- Bộ phận liên quan (vd: "PEEL")
    is_active   BOOLEAN DEFAULT TRUE,         -- Có dùng để inject vào prompt không
    created_by  UUID REFERENCES auth.users(id),
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Index để query nhanh
CREATE INDEX IF NOT EXISTS idx_meal_ai_examples_active ON meal_ai_examples(is_active);

-- RLS policies
ALTER TABLE meal_ai_examples ENABLE ROW LEVEL SECURITY;

-- Tất cả authenticated users đều đọc được (để API route server-side có thể đọc)
CREATE POLICY "meal_ai_examples_select" ON meal_ai_examples
    FOR SELECT USING (auth.role() = 'authenticated');

-- Chỉ admin/HR được insert/update/delete
CREATE POLICY "meal_ai_examples_insert" ON meal_ai_examples
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'hr', 'hse_admin')
        )
    );

CREATE POLICY "meal_ai_examples_update" ON meal_ai_examples
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'hr', 'hse_admin')
        )
    );

CREATE POLICY "meal_ai_examples_delete" ON meal_ai_examples
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'hr', 'hse_admin')
        )
    );

-- Vài ví dụ mẫu để bắt đầu
INSERT INTO meal_ai_examples (title, input_text, expected_json, dept_hint, is_active) VALUES
(
    'Châu MC Peeling – Ca 2',
    'Châu MC Peeling
Date: 26/03/2026
Khu vực : Peeling mc
Ca: 2
Chính thức hiện diện: 8
Chính thức vắng: 1
OT:',
    '[{"senderHint":"Châu MC Peeling","date":"2026-03-26","area":"PEEL","shift":"2","officialPresent":8,"officialPresentNote":"","officialAbsent":1,"seasonalPresent":0,"seasonalAbsent":0,"ot":"","vegetarian":null}]'::JSONB,
    'PEEL',
    TRUE
),
(
    'Kiệt Steaming – Ca 3',
    'Kiệt Nguyễn steaming
Date:25/03/2026
Khu vực : steaming
Ca:3
Chính thức hiện diện: 4
Chính thức vắng: 0
Thời vụ hiện diện:0
Thời vụ vắng :0
OT:0',
    '[{"senderHint":"Kiệt Nguyễn steaming","date":"2026-03-25","area":"STEAM","shift":"3","officialPresent":4,"officialPresentNote":"","officialAbsent":0,"seasonalPresent":0,"seasonalAbsent":0,"ot":"0","vegetarian":null}]'::JSONB,
    'STEAM',
    TRUE
);
