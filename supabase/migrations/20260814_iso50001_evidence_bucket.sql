-- ISO 50001 Evidence Storage
-- Tạo bucket lưu chứng từ/evidence cho từng tháng

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'iso50001-evidence',
    'iso50001-evidence',
    false,
    20971520, -- 20MB per file
    ARRAY[
        'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic',
        'application/pdf'
    ]
)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users: upload vào bucket
CREATE POLICY "iso50001_evidence_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'iso50001-evidence');

-- Authenticated users: xem danh sách file
CREATE POLICY "iso50001_evidence_select"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'iso50001-evidence');

-- Authenticated users: xóa file của chính mình
CREATE POLICY "iso50001_evidence_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'iso50001-evidence');
